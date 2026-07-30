import type { FastifyReply, FastifyRequest } from "fastify";
import {
  assertSecretStrength,
  authenticateCookie,
  authorizeRoles,
} from "@seamless-auth/core";

export interface RequireAuthOptions {
  cookieName?: string;
  cookieSecret: string;
}

/**
 * Fastify `preHandler` that enforces authentication using an already-issued
 * Seamless Auth access cookie.
 *
 * Verifies the signed access cookie, attaches the decoded session to
 * `request.user`, and replies 401 when the cookie is missing or invalid.
 *
 * This guard does NOT attempt token refresh. Silent refresh is handled by the
 * plugin's own hook on the auth routes.
 *
 * ### Example
 * ```ts
 * const guard = requireAuth({ cookieSecret: process.env.COOKIE_SECRET! });
 *
 * app.get("/api/me", { preHandler: guard }, async (req) => ({ user: req.user }));
 * ```
 */
export function requireAuth(opts: RequireAuthOptions) {
  const { cookieName = "seamless-access", cookieSecret } = opts;

  // Eagerly, so a weak secret fails at setup rather than on the first request.
  assertSecretStrength("requireAuth: cookieSecret", cookieSecret);

  return async function requireAuthHook(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const { user, rejection } = authenticateCookie({
      token: req.cookies?.[cookieName],
      cookieSecret,
    });

    if (rejection) {
      if (rejection.warn) {
        req.log.warn(
          `[SEAMLESS-AUTH-FASTIFY] - (requireAuth) - ${rejection.warn} Ensure @fastify/cookie is registered.`,
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
