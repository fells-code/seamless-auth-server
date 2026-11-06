import {
  authorizePermissions,
  getSeamlessLogger,
  permissionRequirement,
  type PermissionGuardOptions,
} from "@seamless-auth/core";
import { Request, Response, NextFunction, RequestHandler } from "express";

export interface RequirePermissionOptions extends PermissionGuardOptions {
  /**
   * Where to read a token that omits its permissions because they did not fit.
   * Defaults to the `authServerUrl` given to `requireAuth`. A cookie-only
   * `requireAuth` holds none, so without this such a token gets a 503.
   */
  authServerUrl?: string;
}

/**
 * Express middleware that enforces permission-based authorization, against a
 * session `requireAuth` has already put on `req.user`.
 *
 * Matching is exact and case-sensitive. Refuses with `403 insufficient_permission`,
 * naming no permissions, and an empty list opens nothing. When a token omits its
 * permissions the guard reads them from the auth API, and answers
 * `503 permissions_unavailable` if it cannot.
 *
 * ### Example
 * ```ts
 * const guard = requireAuth({ cookieSecret, authServerUrl, audience });
 *
 * app.get("/reports", guard, requirePermission("reports:read"), listReports);
 *
 * // Bound to the route, so a token for organization A cannot pass on /orgs/B.
 * app.post(
 *   "/orgs/:organizationId/projects",
 *   guard,
 *   requirePermission("projects:write", { organizationParam: "organizationId" }),
 *   createProject,
 * );
 * ```
 *
 * @param required - A permission or list of permissions
 * @param options - `match`, `organization`, `organizationParam`, `authServerUrl`
 */
export function requirePermission(
  required: string | string[],
  options: RequirePermissionOptions = {},
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rejection = await authorizePermissions(req.user, required, {
      ...permissionRequirement(options, req.params),
      authServerUrl: options.authServerUrl,
    });

    if (rejection) {
      if (rejection.warn) {
        getSeamlessLogger().warn(
          `[SEAMLESS-AUTH-EXPRESS] - (requirePermission) - ${rejection.warn}`,
        );
      }

      res.status(rejection.status).json({
        error: rejection.errorCode,
        ...rejection.detail,
      });
      return;
    }

    next();
  };
}
