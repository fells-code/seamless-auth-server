import { authFetch } from "./authFetch.js";
import { createServiceToken } from "./createServiceToken.js";
import { verifyRefreshCookie } from "./verifyRefreshCookie.js";
import { assertSecrets } from "./validateSecrets.js";

export interface RefreshAccessTokenOptions {
  authServerUrl: string;
  cookieSecret: string;
  serviceSecret: string;
  issuer: string;
  audience: string;
  keyId: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

type RefreshAccessTokenResult = {
  sub: string;
  sessionId?: string;
  token: string;
  refreshToken: string;
  roles?: string[];
  email?: string;
  phone?: string | null;
  organizationId?: string | null;
  ttl: number;
  refreshTtl: number;
};

const inFlightRefreshes = new Map<
  string,
  Promise<RefreshAccessTokenResult | null>
>();
const recentRefreshResults = new Map<
  string,
  { result: RefreshAccessTokenResult; expiresAt: number }
>();
const RECENT_REFRESH_RESULT_TTL_MS = 5000;
// Refresh cookies rotate, so a completed entry's key is never looked up again and
// would live forever without this. Sweep expired entries (throttled so it stays off
// the hot path) and cap total size as a backstop against a burst of distinct cookies.
const MAX_RECENT_REFRESH_RESULTS = 10_000;
let lastPruneAt = 0;

function pruneRecentRefreshResults(now: number): void {
  if (now - lastPruneAt >= RECENT_REFRESH_RESULT_TTL_MS) {
    for (const [key, entry] of recentRefreshResults) {
      if (entry.expiresAt <= now) {
        recentRefreshResults.delete(key);
      }
    }
    lastPruneAt = now;
  }

  while (recentRefreshResults.size > MAX_RECENT_REFRESH_RESULTS) {
    const oldest = recentRefreshResults.keys().next().value;
    if (oldest === undefined) break;
    recentRefreshResults.delete(oldest);
  }
}

/**
 * Runs one refresh per key at a time and replays a recent success to callers
 * arriving just after it. The auth API rotates refresh tokens and treats a
 * replay as theft, revoking the whole chain, so two requests that race the same
 * token must be collapsed here rather than both reach it.
 */
async function dedupeRefresh<T extends RefreshAccessTokenResult>(
  key: string,
  run: () => Promise<T | null>,
): Promise<T | null> {
  const now = Date.now();
  const recentRefresh = recentRefreshResults.get(key);
  if (recentRefresh && recentRefresh.expiresAt > now) {
    return recentRefresh.result as T;
  }
  if (recentRefresh) {
    recentRefreshResults.delete(key);
  }

  const existingRefresh = inFlightRefreshes.get(key);
  if (existingRefresh) {
    return existingRefresh as Promise<T | null>;
  }

  const refreshPromise = run();
  inFlightRefreshes.set(key, refreshPromise);

  try {
    const result = await refreshPromise;
    if (result) {
      const insertedAt = Date.now();
      pruneRecentRefreshResults(insertedAt);
      recentRefreshResults.set(key, {
        result,
        expiresAt: insertedAt + RECENT_REFRESH_RESULT_TTL_MS,
      });
    }
    return result;
  } finally {
    inFlightRefreshes.delete(key);
  }
}

export async function refreshAccessToken(
  refreshCookie: string,
  opts: RefreshAccessTokenOptions,
): Promise<RefreshAccessTokenResult | null> {
  assertSecrets(opts);

  return dedupeRefresh(`cookie:${refreshCookie}`, async () => {
    const payload = verifyRefreshCookie(refreshCookie, opts.cookieSecret);
    if (!payload) return null;
    const serviceToken = createServiceToken({
      subject: payload.sub,
      issuer: opts.issuer,
      audience: opts.audience,
      serviceSecret: opts.serviceSecret,
      keyId: opts.keyId,
      refreshToken: payload.refreshToken,
    });

    const response = await authFetch(`${opts.authServerUrl}/refresh`, {
      method: "POST",
      authorization: `Bearer ${payload.refreshToken}`,
      serviceAuthorization: `Bearer ${serviceToken}`,
      forwardedClientIp: opts.forwardedClientIp,
      forwardedUserAgent: opts.forwardedUserAgent,
    });

    if (!response.ok) return null;

    return response.json();
  });
}

class UpstreamRefreshFailure extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Upstream refresh failed with ${status}`);
  }
}

export interface RefreshBearerSessionOptions {
  authServerUrl: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

export interface RefreshBearerSessionResult {
  status: number;
  /** The auth API's body: the rotated session on success, its error otherwise. */
  body: unknown;
}

/**
 * Rotates a session for a bearer client, which holds the raw refresh token.
 *
 * Unlike the cookie path this returns the auth API's failure as-is, because the
 * client reads it: `refresh_token_reused` means the chain is gone and the user
 * must sign in again, which is a different outcome from a transient failure.
 */
export async function refreshBearerSession(
  refreshToken: string,
  opts: RefreshBearerSessionOptions,
): Promise<RefreshBearerSessionResult> {
  const rotated = await dedupeRefresh(
    `bearer:${refreshToken}`,
    async () => {
      const response = await authFetch(`${opts.authServerUrl}/refresh`, {
        method: "POST",
        authorization: `Bearer ${refreshToken}`,
        serviceAuthorization: opts.serviceAuthorization,
        forwardedClientIp: opts.forwardedClientIp,
        forwardedUserAgent: opts.forwardedUserAgent,
      });

      if (!response.ok) {
        // Not cached, so a failed rotation is reported to every caller that
        // asked for it rather than replayed as a success.
        throw new UpstreamRefreshFailure(response.status, await response.json());
      }

      return response.json();
    },
  ).catch((error: unknown) => {
    if (error instanceof UpstreamRefreshFailure) return error;
    throw error;
  });

  if (rotated instanceof UpstreamRefreshFailure) {
    return { status: rotated.status, body: rotated.body };
  }

  return { status: 200, body: rotated };
}
