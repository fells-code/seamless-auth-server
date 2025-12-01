import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

/**
 * Express middleware to enforce a required role from Seamless Auth cookie JWT.
 *
 * @param role        Role name to require (e.g. 'admin')
 * @param cookieName  Cookie name containing JWT (default: 'sa_session')
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
