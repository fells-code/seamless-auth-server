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

const inFlightRefreshes = new Map<string, Promise<RefreshAccessTokenResult | null>>();
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

export async function refreshAccessToken(
  refreshCookie: string,
  opts: RefreshAccessTokenOptions,
): Promise<RefreshAccessTokenResult | null> {
  assertSecrets(opts);

  const now = Date.now();
  const recentRefresh = recentRefreshResults.get(refreshCookie);
  if (recentRefresh && recentRefresh.expiresAt > now) {
    return recentRefresh.result;
  }
  if (recentRefresh) {
    recentRefreshResults.delete(refreshCookie);
  }

  const existingRefresh = inFlightRefreshes.get(refreshCookie);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = (async () => {
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
    });

    if (!response.ok) return null;

    return response.json();
  })();

  inFlightRefreshes.set(refreshCookie, refreshPromise);

  try {
    const result = await refreshPromise;
    if (result) {
      const insertedAt = Date.now();
      pruneRecentRefreshResults(insertedAt);
      recentRefreshResults.set(refreshCookie, {
        result,
        expiresAt: insertedAt + RECENT_REFRESH_RESULT_TTL_MS,
      });
    }
    return result;
  } finally {
    inFlightRefreshes.delete(refreshCookie);
  }
}
