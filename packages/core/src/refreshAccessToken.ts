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

export async function refreshAccessToken(
  refreshCookie: string,
  opts: RefreshAccessTokenOptions,
): Promise<{
  sub: string;
  token: string;
  refreshToken: string;
  roles: string[];
  ttl: number;
  refreshTtl: number;
} | null> {
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
}
