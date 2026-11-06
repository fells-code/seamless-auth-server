import type { FastifyReply, FastifyRequest } from "fastify";
import {
  assertSecretStrength,
  authenticateRequest,
  authorizePermissions,
  authorizeRoles,
  checkOrigin,
  permissionRequirement,
  type PermissionGuardOptions,
} from "@seamless-auth/core";

import { requestCookies } from "./internal/requestCookies.js";

export interface RequireAuthOptions {
  cookieName?: string;
  cookieSecret: string;
  /**
   * Together with `audience`, lets the guard accept the auth API's own access
   * token in `Authorization: Bearer`, which is how a native client with no
   * cookie jar authenticates. Leave both out and the guard accepts cookies
   * only, as it always has. With both set, the access token inside a cookie
   * is verified against the auth API's JWKS too.
   */
  authServerUrl?: string;
  /**
   * Expected `aud` on a bearer access token. The auth API sets it to its
   * ISSUER, so this is `authServerUrl`, or `authServerIssuer` when that is set.
   */
  audience?: string;
  /**
   * Expected `iss` on a bearer access token. Defaults to `authServerUrl`. Set
   * it when this server reaches the auth server at a different URL from the
   * one the auth server advertises as its issuer, for example a host-run app
   * against the Docker stack. Only read when bearer tokens are enabled. The
   * auth API sets `aud` to its ISSUER too, so pass the same value as
   * `audience`.
   */
  authServerIssuer?: string;
  /**
   * Accept a recovery session (`recovery: true` on the access token), which can only
   * enroll a new passkey or authenticator app. Off by default, so such a session gets
   * 403 `enrollment_required`; turn it on only for routes that drive that enrollment.
   */
  allowRecoverySession?: boolean;
  /**
   * `Origin` allowlist for a state-changing request on a cookie session that is
   * `same-site` or carries no `Sec-Fetch-Site`, as on the auth router. Pass the
   * same list. Set, even to `[]`, it is enforced; left out, such a request
   * passes. A `cross-site` one or a literal `null` `Origin` is refused either
   * way.
   */
  allowedOrigins?: string[];
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
    authServerIssuer,
    allowRecoverySession,
    allowedOrigins,
  } = opts;

  // Eagerly, so a weak secret fails at setup rather than on the first request.
  // A guard has no local-mode setting, so only the adapter refuses a placeholder.
  assertSecretStrength("requireAuth: cookieSecret", cookieSecret, {
    allowPlaceholder: true,
  });

  if ((authServerUrl === undefined) !== (audience === undefined)) {
    throw new Error(
      "requireAuth: authServerUrl and audience must be configured together to accept bearer tokens",
    );
  }

  if (authServerUrl === "" || audience === "") {
    throw new Error(
      "requireAuth: authServerUrl and audience must be non-empty to accept bearer tokens",
    );
  }

  const bearer =
    authServerUrl !== undefined && audience !== undefined
      ? { authServerUrl, audience, authServerIssuer }
      : undefined;

  const hint = bearer
    ? "Ensure @fastify/cookie is registered, or that the client sends an `Authorization: Bearer` access token."
    : "Ensure @fastify/cookie is registered.";

  return async function requireAuthHook(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const token = requestCookies(req)[cookieName];

    // A cookie rides a forged request on its own; a bearer token never does.
    if (token) {
      const blocked = checkOrigin({
        method: req.method,
        secFetchSite: firstHeader(req.headers["sec-fetch-site"]),
        origin: firstHeader(req.headers.origin),
        allowedOrigins,
      });

      if (blocked) {
        return reply.status(blocked.status).send({ error: blocked.errorCode });
      }
    }

    const { user, rejection } = await authenticateRequest({
      token,
      cookieSecret,
      authorization: req.headers.authorization,
      bearer,
      allowRecoverySession,
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

export interface RequirePermissionOptions extends PermissionGuardOptions {
  /**
   * Where to read a token that omits its permissions because they did not fit.
   * Defaults to the `authServerUrl` given to `requireAuth`. A cookie-only
   * `requireAuth` holds none, so without this such a token gets a 503.
   */
  authServerUrl?: string;
}

/**
 * Fastify `preHandler` that enforces permission-based authorization, against a
 * session `requireAuth` has already put on the request.
 *
 * Matching is exact and case-sensitive. Refuses with `403 insufficient_permission`,
 * naming no permissions, and an empty list opens nothing. When a token omits its
 * permissions the guard reads them from the auth API, and answers
 * `503 permissions_unavailable` if it cannot.
 *
 * ### Example
 * ```ts
 * // Bound to the route, so a token for organization A cannot pass on /orgs/B.
 * app.post("/orgs/:organizationId/projects", {
 *   preHandler: [
 *     requireAuth({ cookieSecret, authServerUrl, audience }),
 *     requirePermission("projects:write", { organizationParam: "organizationId" }),
 *   ],
 * }, createProject);
 * ```
 */
export function requirePermission(
  required: string | string[],
  options: RequirePermissionOptions = {},
) {
  return async function requirePermissionHook(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const rejection = await authorizePermissions(req.user, required, {
      ...permissionRequirement(options, req.params),
      authServerUrl: options.authServerUrl,
    });

    if (rejection) {
      if (rejection.warn) {
        req.log.warn(
          `[SEAMLESS-AUTH-FASTIFY] - (requirePermission) - ${rejection.warn}`,
        );
      }

      return reply
        .status(rejection.status)
        .send({ error: rejection.errorCode, ...rejection.detail });
    }
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
