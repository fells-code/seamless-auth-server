import { authFetch } from "./authFetch.js";
import { verifyCookieJwt } from "./verifyCookieJwt.js";

export interface GetSeamlessUserOptions {
  authServerUrl: string;
  cookieSecret: string;
  cookieName?: string;
}

export async function getSeamlessUser<T = any>(
  cookies: Record<string, string | undefined>,
  opts: GetSeamlessUserOptions,
): Promise<T | null> {
  const cookieName = opts.cookieName ?? "seamless-access";
  const token = cookies[cookieName];

  if (!token) return null;

  const payload = verifyCookieJwt(token, opts.cookieSecret);
  if (!payload) return null;

  const response = await authFetch(`${opts.authServerUrl}/users/me`, {
    method: "GET",
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.user ?? null;
}
