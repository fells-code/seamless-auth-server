import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

/**
 * Express middleware that enforces role-based authorization for Seamless Auth sessions.
 *
 * This guard assumes that `requireAuth()` has already validated the request
 * and populated `req.user` with the decoded Seamless Auth session payload.
 * It then checks whether the user’s roles include the required role (or any
 * of several, when an array is provided).
 *
 * If the user possesses the required authorization, the request proceeds.
 * Otherwise, the middleware responds with a 403 Forbidden error.
 *
 * ### Responsibilities
 * - Validates that `req.user` is present (enforced upstream by `requireAuth`)
 * - Ensures the authenticated user includes the specified role(s)
 * - Blocks unauthorized access with a standardized JSON 403 response
 *
 * ### Parameters
 * - **requiredRole** — A role (string) or list of roles the user must have.
 *   If an array is provided, *any* matching role grants access.
 * - **cookieName** — Optional name of the access cookie to inspect.
 *   Defaults to `"seamless-access"`, but typically not needed because
 *   `requireAuth` is expected to run first.
 *
 * ### Example
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
 * ```
 *
 * @param requiredRole - A role or list of roles required to access the route.
 * @param cookieName - Optional access cookie name (defaults to `seamless-access`).
 * @returns An Express middleware function enforcing role-based access control.
 */
export function requireRole(
  role: string,
  cookieName = "seamless-access"
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const COOKIE_SECRET = process.env.SEAMLESS_COOKIE_SIGNING_KEY!;
      if (!COOKIE_SECRET) {
        console.warn(
          "[SeamlessAuth] SEAMLESS_COOKIE_SIGNING_KEY missing — requireRole will always fail."
        );
        throw new Error("Missing required env SEAMLESS_COOKIE_SIGNING_KEY");
      }
      const token = req.cookies?.[cookieName];
      if (!token) {
        res.status(401).json({ error: "Missing access cookie" });
        return;
      }

      // Verify JWT signature
      const payload = jwt.verify(token, COOKIE_SECRET, {
        algorithms: ["HS256"],
      }) as JwtPayload;

      // Check role membership
      if (!payload.roles?.includes(role)) {
        res.status(403).json({ error: `Forbidden: ${role} role required` });
        return;
      }

      next();
    } catch (err: any) {
      console.error(`[RequireRole] requireRole(${role}) failed:`, err.message);
      res.status(401).json({ error: "Invalid or expired access cookie" });
    }
  };
}
