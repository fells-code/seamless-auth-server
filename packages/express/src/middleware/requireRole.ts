import { hasScopedRole } from "@seamless-auth/core";
import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express middleware that enforces role-based authorization for Seamless Auth.
 *
 * This middleware assumes `requireAuth()` has already:
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
 *  * ### Example
 * ```ts
 * // Require a single role
 * app.get("/admin/users",
 *   requireAuth(),
 *   requireRole("admin"),
 *   (req, res) => {
 *     res.send("Welcome admin!");
 *   }
 * );
 *
 * // Allow any of multiple roles
 * app.post("/settings",
 *   requireAuth(),
 *   requireRole(["admin", "supervisor"]),
 *   updateSettingsHandler
 * );
 *
 * @param requiredRoles - A role or list of roles required to access the route
 */
export function requireRole(requiredRoles: string | string[]): RequestHandler {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: "Authentication required",
      });
      return;
    }

    if (!Array.isArray(user.roles)) {
      res.status(403).json({
        error: "User has no roles assigned",
      });
      return;
    }

    const hasRole = hasScopedRole(user.roles, roles);

    if (!hasRole) {
      res.status(403).json({
        error: "Insufficient role",
        required: roles,
        actual: user.roles,
      });
      return;
    }

    next();
  };
}
