import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const COOKIE_SECRET = process.env.SEAMLESS_COOKIE_SIGNING_KEY!;
if (!COOKIE_SECRET) {
  console.warn(
    "[SeamlessAuth] SEAMLESS_COOKIE_SIGNING_KEY missing — requireAuth will always fail."
  );
}

/**
 * Express middleware that verifies a Seamless Auth access cookie.
 * - Reads and verifies signed cookie JWT
 * - Attaches decoded payload to req.user
 * - Returns 401 if missing/invalid/expired
 */
export function requireAuth(cookieName = "seamless-auth-access") {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const token = req.cookies?.[cookieName];
      if (!token) {
        res.status(401).json({ error: "Missing access cookie" });
        return;
      }

      const payload = jwt.verify(token, COOKIE_SECRET, {
        algorithms: ["HS256"],
      });

      

      // Attach decoded JWT claims to request for downstream handlers
      (req as any).user = payload;
      next();
    } catch (err: any) {
      console.error("[SeamlessAuth] requireAuth error:", err.message);
      res.status(401).json({ error: "Invalid or expired access cookie" });
      return;
    }
  };
}
