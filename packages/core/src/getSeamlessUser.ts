import { verifyCookieJwt } from "./verifyCookieJwt.js";
import { authFetch } from "./authFetch.js";
import { assertSecretStrength } from "./validateSecrets.js";

/**
 * The user object returned by the auth server's `GET /users/me`.
 *
 * `lastLogin` is an ISO 8601 timestamp, null until the user's first login.
 * `activeOrganizationId` is null when the access token carries no org context.
 */
export interface SeamlessUser {
  id: string;
  email: string;
  phone: string | null;
  roles: string[];
  lastLogin?: string | null;
  activeOrganizationId?: string | null;
}

export interface GetSeamlessUserOptions {
  authServerUrl: string;
  cookieSecret: string;
  authorization?: string;
  cookieName?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
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
export async function getSeamlessUser<T = SeamlessUser>(
  cookies: Record<string, string | undefined>,
  opts: GetSeamlessUserOptions,
): Promise<T | null> {
  assertSecretStrength("cookieSecret", opts.cookieSecret);

  const cookieName = opts.cookieName ?? "seamless-access";
  const token = cookies[cookieName];

  if (!token) return null;

  const payload = verifyCookieJwt(token, opts.cookieSecret);
  if (!payload) return null;

  const response = await authFetch(`${opts.authServerUrl}/users/me`, {
    method: "GET",
    authorization: opts.authorization,
    serviceAuthorization: opts.serviceAuthorization,
    forwardedClientIp: opts.forwardedClientIp,
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data?.user ?? null;
}
