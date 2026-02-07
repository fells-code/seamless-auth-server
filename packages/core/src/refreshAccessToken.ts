import { authFetch } from "./authFetch.js";
import { verifyRefreshCookie } from "./verifyRefreshCookie.js";
import { createServiceToken } from "./createServiceToken.js";

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

  const serviceToken = createServiceToken({
    issuer: opts.issuer,
    audience: opts.audience,
    subject: payload.sub,
    refreshToken: payload.refreshToken,
    serviceSecret: opts.serviceSecret,
    keyId: opts.keyId,
  });

  const response = await authFetch(`${opts.authServerUrl}/refresh`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${serviceToken}`,
    },
  });

  if (!response.ok) return null;

  return response.json();
}
