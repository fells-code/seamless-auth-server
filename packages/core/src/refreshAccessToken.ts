import { authFetch } from "./authFetch.js";
import { createServiceToken } from "./createServiceToken.js";
import { verifyRefreshCookie } from "./verifyRefreshCookie.js";

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
  ttl: number;
  refreshTtl: number;
};

const inFlightRefreshes = new Map<string, Promise<RefreshAccessTokenResult | null>>();
const recentRefreshResults = new Map<
  string,
  { result: RefreshAccessTokenResult; expiresAt: number }
>();
const RECENT_REFRESH_RESULT_TTL_MS = 5000;

export async function refreshAccessToken(
  refreshCookie: string,
  opts: RefreshAccessTokenOptions,
): Promise<RefreshAccessTokenResult | null> {
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
      recentRefreshResults.set(refreshCookie, {
        result,
        expiresAt: Date.now() + RECENT_REFRESH_RESULT_TTL_MS,
      });
    }
    return result;
  } finally {
    inFlightRefreshes.delete(refreshCookie);
  }
}
