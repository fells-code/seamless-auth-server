import { authorizeRoles } from "@seamless-auth/core";
import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express middleware that enforces role-based authorization for Seamless Auth.
 *
 * This middleware assumes `requireAuth` has already:
 * - authenticated the request
 * - populated `req.user` with the authenticated session payload
 *
 * `requireRole` performs **authorization only**. It does not inspect cookies,
 * verify tokens, or read environment variables.
 *
 * If any of the required roles are granted to the user, access is granted.
 * Scoped role checks understand `admin:read`/`admin:write` style names. A broad
 * role such as `admin` grants scoped access under that role, and a matching
 * `:write` role grants `:read` access.
 * Otherwise, a 403 Forbidden response is returned.
 *
 * ### Example
 * ```ts
 * const guard = requireAuth({ cookieSecret: process.env.COOKIE_SECRET! });
 *
 * // Require a single role
 * app.get("/admin/users",
 *   guard,
 *   requireRole("admin"),
 *   (req, res) => {
 *     res.send("Welcome admin!");
 *   }
 * );
 *
 * // Allow any of multiple roles
 * app.post("/settings",
 *   guard,
 *   requireRole(["admin", "supervisor"]),
 *   updateSettingsHandler
 * );
 * ```
 *
 * @param requiredRoles - A role or list of roles required to access the route
 */
export function requireRole(requiredRoles: string | string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rejection = authorizeRoles(req.user, requiredRoles);

    if (rejection) {
      res.status(rejection.status).json({
        error: rejection.errorCode,
        ...rejection.detail,
      });
      return;
    }

    next();
  };
}
