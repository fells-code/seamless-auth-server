import { createHash } from "node:crypto";

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

/**
 * Runs one refresh per key at a time. The auth API rotates refresh tokens and
 * treats a replay as theft, revoking the whole chain, so two requests that race
 * the same token must be collapsed here rather than both reach it.
 *
 * Only a rotation still in flight is shared. Once it completes, a caller that
 * presents the same token again goes to the auth API, whose reuse detection is
 * what catches a stolen token; handing that caller the new session would hide
 * the replay. The refresh cookie is the one exception, see
 * `completedCookieRefreshes`.
 */
async function dedupeRefresh<T extends RefreshAccessTokenResult>(
  key: string,
  run: () => Promise<T | null>,
): Promise<T | null> {
  const existingRefresh = inFlightRefreshes.get(key);
  if (existingRefresh) {
    return existingRefresh as Promise<T | null>;
  }

  const refreshPromise = run();
  inFlightRefreshes.set(key, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    inFlightRefreshes.delete(key);
  }
}

/**
 * Browser tabs share one cookie jar, so a second tab can send the old refresh
 * cookie just after the first tab's rotation completed, before its response set
 * the new one. Sending that to the auth API would revoke the session for both
 * tabs, so a successful cookie rotation is kept for a few seconds and handed to
 * a caller presenting the same old cookie. Bearer and session token refreshes
 * never use this: their clients hold the token themselves, so a late repeat is
 * a replay for the auth API to judge.
 *
 * Keyed on a hash of the cookie so the map never holds a live refresh token.
 */
const COMPLETED_COOKIE_REFRESH_TTL_MS = 5000;
// Rotated cookies are never looked up again, so expired entries are swept on
// insert (throttled to once per TTL) and the size is capped as a backstop
// against a burst of distinct cookies.
const MAX_COMPLETED_COOKIE_REFRESHES = 10_000;
const completedCookieRefreshes = new Map<
  string,
  { result: RefreshAccessTokenResult; expiresAt: number }
>();
let lastCompletedPruneAt = 0;

function pruneCompletedCookieRefreshes(now: number): void {
  if (now - lastCompletedPruneAt >= COMPLETED_COOKIE_REFRESH_TTL_MS) {
    for (const [key, entry] of completedCookieRefreshes) {
      if (entry.expiresAt <= now) completedCookieRefreshes.delete(key);
    }
    lastCompletedPruneAt = now;
  }

  while (completedCookieRefreshes.size >= MAX_COMPLETED_COOKIE_REFRESHES) {
    const oldest = completedCookieRefreshes.keys().next().value;
    if (oldest === undefined) break;
    completedCookieRefreshes.delete(oldest);
  }
}

async function dedupeCookieRefresh(
  refreshCookie: string,
  run: () => Promise<RefreshAccessTokenResult | null>,
): Promise<RefreshAccessTokenResult | null> {
  const key = createHash("sha256").update(refreshCookie).digest("base64url");

  const completed = completedCookieRefreshes.get(key);
  if (completed) {
    if (completed.expiresAt > Date.now()) return completed.result;
    completedCookieRefreshes.delete(key);
  }

  const result = await dedupeRefresh(`cookie:${key}`, run);

  // Every caller sharing the in-flight rotation reaches this; only the first
  // insert matters, and a later one must not extend the window.
  if (result && !completedCookieRefreshes.has(key)) {
    const now = Date.now();
    pruneCompletedCookieRefreshes(now);
    completedCookieRefreshes.set(key, {
      result,
      expiresAt: now + COMPLETED_COOKIE_REFRESH_TTL_MS,
    });
  }

  return result;
}

export async function refreshAccessToken(
  refreshCookie: string,
  opts: RefreshAccessTokenOptions,
): Promise<RefreshAccessTokenResult | null> {
  assertSecrets(opts, { allowPlaceholder: true });

  return dedupeCookieRefresh(refreshCookie, async () => {
    const payload = verifyRefreshCookie(refreshCookie, opts.cookieSecret);
    if (!payload) return null;
    return rotate(payload, opts);
  });
}

/**
 * Rotates a refresh token this request already holds unsigned, such as one a
 * silent refresh earlier in the same request just issued. The cookie carrying
 * it has not reached the browser yet, so it cannot be read back from one.
 */
export async function refreshSessionToken(
  payload: { sub: string; refreshToken: string },
  opts: RefreshAccessTokenOptions,
): Promise<RefreshAccessTokenResult | null> {
  assertSecrets(opts, { allowPlaceholder: true });

  return dedupeRefresh(`token:${payload.refreshToken}`, () =>
    rotate(payload, opts),
  );
}

async function rotate(
  payload: { sub: string; refreshToken: string },
  opts: RefreshAccessTokenOptions,
): Promise<RefreshAccessTokenResult | null> {
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
