import {
  assertSecretStrength,
  authenticateRequest,
  authorizePermissions,
  authorizeRoles,
  checkOrigin,
  type GuardRejection,
  type GuardUser,
  getSeamlessLogger,
  permissionRequirement,
  type PermissionGuardOptions,
} from "@seamless-auth/core";

import { readCookies } from "./internal/context.js";
import type { SeamlessAuthHandlerOptions } from "./options.js";

/**
 * What the guards need. A subset of the route handler options, so the same
 * object can be passed to both.
 */
export type SeamlessGuardOptions = Pick<
  SeamlessAuthHandlerOptions,
  | "authServerUrl"
  | "audience"
  | "authServerIssuer"
  | "cookieSecret"
  | "accessCookieName"
  | "cookieSecure"
  | "cookieSameSite"
  | "allowedOrigins"
> & {
  /**
   * Accept a recovery session (`recovery: true` on the access token), which can
   * only enroll a new passkey or authenticator app. Off by default, so such a
   * session gets 403 `enrollment_required`; turn it on only for the routes that
   * drive that enrollment.
   */
  allowRecoverySession?: boolean;
};

export type SeamlessPermissionGuardOptions = SeamlessGuardOptions &
  PermissionGuardOptions;

/**
 * The signed-in user a guard hands its route handler. Roles and
 * `organizationId` come from the access token as verified against the auth
 * API's key set, for a cookie session as much as a bearer one.
 */
export type SeamlessGuardUser = GuardUser;

export type SeamlessGuardedHandler<Context> = (
  request: Request,
  context: Context,
  user: SeamlessGuardUser,
) => Response | Promise<Response>;

export type SeamlessGuardedRoute<Context> = (
  request: Request,
  context: Context,
) => Promise<Response>;

const LOG_PREFIX = "[SEAMLESS-AUTH-NEXTJS]";

function refuse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function toResponse(rejection: GuardRejection): Response {
  return refuse(rejection.status, rejection.errorCode);
}

function prepare(name: string, opts: SeamlessGuardOptions) {
  assertSecretStrength(`${name}: cookieSecret`, opts.cookieSecret, {
    allowPlaceholder: true,
  });

  if (!opts.authServerUrl || !opts.audience) {
    throw new Error(
      `${name}: authServerUrl and audience are required to verify access tokens`,
    );
  }

  const cookieName = opts.accessCookieName ?? "seamless-access";
  const bearer = {
    authServerUrl: opts.authServerUrl,
    audience: opts.audience,
    authServerIssuer: opts.authServerIssuer,
  };

  return async function authenticate(
    request: Request,
  ): Promise<{ user: SeamlessGuardUser } | { response: Response }> {
    const token = readCookies(request)[cookieName];

    if (token) {
      const blocked = checkOrigin({
        method: request.method,
        secFetchSite: request.headers.get("sec-fetch-site") ?? undefined,
        origin: request.headers.get("origin") ?? undefined,
        allowedOrigins: opts.allowedOrigins,
      });

      if (blocked) {
        return { response: refuse(blocked.status, blocked.errorCode) };
      }
    }

    const { user, rejection } = await authenticateRequest({
      token,
      cookieSecret: opts.cookieSecret,
      authorization: request.headers.get("authorization") ?? undefined,
      bearer,
      allowRecoverySession: opts.allowRecoverySession,
    });

    if (rejection) {
      if (rejection.warn) {
        getSeamlessLogger().warn(`${LOG_PREFIX} - (${name}) - ${rejection.warn}`);
      }

      return { response: toResponse(rejection) };
    }

    return { user };
  };
}

/**
 * Wraps an App Router route handler so it only runs for a signed-in user: the
 * access cookie this adapter set, or the auth API's access token in
 * `Authorization: Bearer` (how a native client calls). The cookie wins when
 * both are present.
 *
 * Answers 401 `unauthenticated` for a missing, invalid or pre-auth credential,
 * 403 `enrollment_required` for a recovery session, and 403
 * `cross_site_request_blocked` for a cookie request the origin check refuses.
 *
 * It never refreshes. An expired access cookie is a 401, and the client renews
 * the session through the auth routes, as it does for the Express and Fastify
 * guards.
 *
 * ### Example
 * ```ts
 * // app/api/me/route.ts
 * export const GET = requireAuth(
 *   async (_request, _context, user) => Response.json({ id: user.id }),
 *   seamlessOptions,
 * );
 * ```
 */
export function requireAuth<Context = unknown>(
  handler: SeamlessGuardedHandler<Context>,
  opts: SeamlessGuardOptions,
): SeamlessGuardedRoute<Context> {
  const authenticate = prepare("requireAuth", opts);

  return async (request, context) => {
    const result = await authenticate(request);
    return "response" in result
      ? result.response
      : handler(request, context, result.user);
  };
}

/**
 * `requireAuth`, plus a role check. Any one of `roles` is enough, with scoped
 * role matching: a broad `admin` grants `admin:...`, and a `:write` role grants
 * the matching `:read`. A user with none of them gets 403 `insufficient_role`;
 * the body never names the roles.
 *
 * ### Example
 * ```ts
 * // app/api/admin/route.ts
 * export const POST = requireRole(
 *   ["admin", "support:write"],
 *   async (request, _context, user) => Response.json(await act(request, user)),
 *   seamlessOptions,
 * );
 * ```
 */
export function requireRole<Context = unknown>(
  roles: string | string[],
  handler: SeamlessGuardedHandler<Context>,
  opts: SeamlessGuardOptions,
): SeamlessGuardedRoute<Context> {
  const required = Array.isArray(roles) ? roles : [roles];

  if (
    required.length === 0 ||
    required.some((role) => typeof role !== "string" || !role.trim())
  ) {
    throw new Error("requireRole: give at least one non-empty role");
  }

  const authenticate = prepare("requireRole", opts);

  return async (request, context) => {
    const result = await authenticate(request);

    if ("response" in result) {
      return result.response;
    }

    if (authorizeRoles(result.user, required)) {
      return refuse(403, "insufficient_role");
    }

    return handler(request, context, result.user);
  };
}

/**
 * `requireAuth`, plus a permission check. Matching is exact and case-sensitive.
 * Refuses with 403 `insufficient_permission`, naming no permissions. A token that
 * omits its permissions has them read from `authServerUrl`, and gets 503
 * `permissions_unavailable` if they cannot be read.
 *
 * Unlike `requireRole`, an empty list does not throw when the module loads: it is
 * a 403 on every request, as in every other Seamless adapter.
 *
 * `organizationParam` names a dynamic segment, read from the route context's
 * `params`, which must equal the active organization.
 *
 * ### Example
 * ```ts
 * // app/api/orgs/[organizationId]/projects/route.ts
 * export const POST = requirePermission(
 *   "projects:write",
 *   async (request, _context, user) => Response.json(await create(request, user)),
 *   { ...seamlessOptions, organizationParam: "organizationId" },
 * );
 * ```
 */
export function requirePermission<Context = unknown>(
  required: string | string[],
  handler: SeamlessGuardedHandler<Context>,
  opts: SeamlessPermissionGuardOptions,
): SeamlessGuardedRoute<Context> {
  const authenticate = prepare("requirePermission", opts);

  return async (request, context) => {
    const result = await authenticate(request);

    if ("response" in result) {
      return result.response;
    }

    // `params` is a promise from Next.js 15 and a plain object before it.
    const params =
      opts.organizationParam === undefined
        ? undefined
        : await (context as { params?: unknown } | undefined)?.params;

    const rejection = await authorizePermissions(result.user, required, {
      ...permissionRequirement(opts, params),
      authServerUrl: opts.authServerUrl,
    });

    if (rejection) {
      if (rejection.warn) {
        getSeamlessLogger().warn(
          `${LOG_PREFIX} - (requirePermission) - ${rejection.warn}`,
        );
      }

      return toResponse(rejection);
    }

    return handler(request, context, result.user);
  };
}
