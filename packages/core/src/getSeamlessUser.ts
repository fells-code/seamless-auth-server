import { verifyCookieJwt } from "./verifyCookieJwt.js";
import { authFetch } from "./authFetch.js";

export interface GetSeamlessUserOptions {
  authServerUrl: string;
  cookieSecret: string;
  authorization: string;
  cookieName?: string;
}

/**
 * Resolves the authenticated Seamless Auth user from an access cookie.
 *
 * This function:
 * - Verifies the access cookie locally
 * - Uses the verified token to authenticate a request to the auth server
 * - Returns the canonical user object, or null if authentication fails
 *
 * This is intended for server-side usage (SSR, API routes, edge functions).
 */
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
    headers: {
      Authorization: opts.authorization,
    },
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.user ?? null;
}
