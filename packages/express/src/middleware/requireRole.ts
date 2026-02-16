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
 * If any of the required roles are present on the user, access is granted.
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

    const hasRole = roles.some((role) => user.roles.includes(role));

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
