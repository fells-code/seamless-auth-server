import type { MeUser } from "@seamless-auth/types";

import { authFetch } from "./authFetch.js";
import { assertSecretStrength } from "./validateSecrets.js";
import { extractBearerToken, verifyAccessToken } from "./verifyAccessToken.js";
import { verifyCookieJwt } from "./verifyCookieJwt.js";

/**
 * The user object returned by the auth server's `GET /users/me`.
 *
 * `lastLogin` is an ISO 8601 timestamp, null until the user's first login.
 * `activeOrganizationId` is null when the access token carries no org context.
 */
/**
 * The caller's own user record, hydrated from the auth API. Distinct from
 * `SeamlessAuthUser`, which is only what the access cookie carries.
 *
 * Aliased to the types package's `MeUser` rather than declared again. The name
 * stays `SeamlessUser` here because that is what adapters and adopters import.
 */
export type SeamlessUser = MeUser;

export interface GetSeamlessUserOptions {
  authServerUrl: string;
  cookieSecret: string;
  authorization?: string;
  cookieName?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
  /**
   * Enables the bearer path for a request that carries no access cookie: the
   * auth API's own access token in `Authorization: Bearer`, verified against the
   * API's JWKS before it is forwarded. Left out, only the cookie is consulted.
   */
  bearer?: {
    /** The request's raw `Authorization` header. */
    authorization?: string;
    /** Expected `aud` on the access token. The issuer is `authServerUrl`. */
    audience: string;
  };
}

/**
 * Resolves the authenticated Seamless Auth user from the request's credential.
 *
 * This function:
 * - Verifies the access cookie locally, or the bearer access token against JWKS
 *   when there is no cookie and `bearer` is configured
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

  const authorization = await resolveUpstreamAuthorization(cookies, opts);
  if (authorization === null) return null;

  const response = await authFetch(`${opts.authServerUrl}/users/me`, {
    method: "GET",
    authorization,
    serviceAuthorization: opts.serviceAuthorization,
    forwardedClientIp: opts.forwardedClientIp,
    forwardedUserAgent: opts.forwardedUserAgent,
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data?.user ?? null;
}

/**
 * `null` means the request carried nothing that verifies. `undefined` keeps the
 * cookie path's historical shape: a verified cookie with no caller-supplied
 * `authorization` still reaches the auth server, which decides for itself.
 */
async function resolveUpstreamAuthorization(
  cookies: Record<string, string | undefined>,
  opts: GetSeamlessUserOptions,
): Promise<string | undefined | null> {
  const cookieName = opts.cookieName ?? "seamless-access";
  const cookie = cookies[cookieName];

  if (cookie) {
    const payload = verifyCookieJwt(cookie, opts.cookieSecret);
    return payload ? opts.authorization : null;
  }

  if (!opts.bearer) return null;

  const token = extractBearerToken(opts.bearer.authorization);
  if (!token) return null;

  const claims = await verifyAccessToken(
    token,
    opts.authServerUrl,
    opts.bearer.audience,
  );

  return claims ? `Bearer ${token}` : null;
}
