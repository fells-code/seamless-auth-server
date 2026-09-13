import type { FastifyReply, FastifyRequest } from "fastify";
import {
  assertSecretStrength,
  authenticateRequest,
  authorizeRoles,
} from "@seamless-auth/core";

export interface RequireAuthOptions {
  cookieName?: string;
  cookieSecret: string;
  /**
   * Together with `audience`, lets the guard accept the auth API's own access
   * token in `Authorization: Bearer`, which is how a native client with no
   * cookie jar authenticates. Leave both out and the guard accepts cookies
   * only, as it always has.
   */
  authServerUrl?: string;
  /** Expected `aud` on a bearer access token. Usually the same value as `authServerUrl`. */
  audience?: string;
}

/**
 * Fastify `preHandler` that enforces authentication using an already-issued
 * Seamless Auth session: the signed access cookie, or, when `authServerUrl` and
 * `audience` are configured, a bearer access token from the auth API.
 *
 * Attaches the decoded session to `request.user` and replies 401 when the
 * credential is missing or invalid. A cookie takes precedence when present.
 *
 * This guard does NOT attempt token refresh. Silent refresh is handled by the
 * plugin's own hook on the auth routes; a bearer client refreshes through
 * `POST /auth/refresh` itself.
 *
 * ### Example
 * ```ts
 * const guard = requireAuth({
 *   cookieSecret: process.env.COOKIE_SECRET!,
 *   authServerUrl: process.env.AUTH_SERVER_URL,
 *   audience: process.env.AUTH_SERVER_URL,
 * });
 *
 * app.get("/api/me", { preHandler: guard }, async (req) => ({ user: req.user }));
 * ```
 */
export function requireAuth(opts: RequireAuthOptions) {
  const {
    cookieName = "seamless-access",
    cookieSecret,
    authServerUrl,
    audience,
  } = opts;

  // Eagerly, so a weak secret fails at setup rather than on the first request.
  assertSecretStrength("requireAuth: cookieSecret", cookieSecret);

  if ((authServerUrl === undefined) !== (audience === undefined)) {
    throw new Error(
      "requireAuth: authServerUrl and audience must be configured together to accept bearer tokens",
    );
  }

  const bearer =
    authServerUrl !== undefined && audience !== undefined
      ? { authServerUrl, audience }
      : undefined;

  const hint = bearer
    ? "Ensure @fastify/cookie is registered, or that the client sends an `Authorization: Bearer` access token."
    : "Ensure @fastify/cookie is registered.";

  return async function requireAuthHook(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const { user, rejection } = await authenticateRequest({
      token: req.cookies?.[cookieName],
      cookieSecret,
      authorization: req.headers.authorization,
      bearer,
    });

    if (rejection) {
      if (rejection.warn) {
        req.log.warn(
          `[SEAMLESS-AUTH-FASTIFY] - (requireAuth) - ${rejection.warn} ${hint}`,
        );
      }

      return reply
        .status(rejection.status)
        .send({ error: rejection.errorCode });
    }

    req.user = user;
  };
}

/**
 * Fastify `preHandler` that enforces role-based authorization, against a session
 * `requireAuth` has already put on the request.
 *
 * Any one of the required roles is enough. Scoped names are understood: a broad
 * `admin` grants everything under it, and a `:write` role grants `:read`.
 *
 * ### Example
 * ```ts
 * app.get("/admin/users", {
 *   preHandler: [requireAuth({ cookieSecret }), requireRole("admin")],
 * }, listUsers);
 * ```
 */
export function requireRole(requiredRoles: string | string[]) {
  return async function requireRoleHook(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const rejection = authorizeRoles(req.user, requiredRoles);

    if (rejection) {
      return reply
        .status(rejection.status)
        .send({ error: rejection.errorCode, ...rejection.detail });
    }
  };
}
