import { authFetch } from "./authFetch.js";
import { verifyRefreshCookie } from "./verifyRefreshCookie.js";

export interface RefreshAccessTokenOptions {
  authServerUrl: string;
  cookieSecret: string;
  serviceSecret: string;
  issuer: string;
  audience: string;
  keyId: string;
}

type RefreshAccessTokenResult = {
  sub: string;
  token: string;
  refreshToken: string;
  roles?: string[];
  email?: string;
  phone?: string | null;
  ttl: number;
  refreshTtl: number;
};

const inFlightRefreshes = new Map<string, Promise<RefreshAccessTokenResult | null>>();

export async function refreshAccessToken(
  refreshCookie: string,
  opts: RefreshAccessTokenOptions,
): Promise<RefreshAccessTokenResult | null> {
  const existingRefresh = inFlightRefreshes.get(refreshCookie);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = (async () => {
  const payload = verifyRefreshCookie(refreshCookie, opts.cookieSecret);
  if (!payload) return null;

  const response = await authFetch(`${opts.authServerUrl}/refresh`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${payload.refreshToken}`,
    },
  });

  if (!response.ok) return null;

  return response.json();
  })();

  inFlightRefreshes.set(refreshCookie, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    inFlightRefreshes.delete(refreshCookie);
  }
}
