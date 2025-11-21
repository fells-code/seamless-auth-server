import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { refreshAccessToken } from "../internal/refreshAccessToken.js";
import { setSessionCookie } from "../internal/cookie.js";

const COOKIE_SECRET = process.env.SEAMLESS_COOKIE_SIGNING_KEY!;
if (!COOKIE_SECRET) {
  console.warn(
    "[SeamlessAuth] SEAMLESS_COOKIE_SIGNING_KEY missing — requireAuth will always fail."
  );
}

const AUTH_SERVER_URL = process.env.AUTH_SERVER!;

/**
 * Express middleware that verifies a Seamless Auth access cookie.
 * - Reads and verifies signed cookie JWT
 * - Attaches decoded payload to req.user
 * - Returns 401 if missing/invalid/expired
 */
export function requireAuth(
  cookieName = "seamless-auth-access",
  refreshCookieName = "seamless-auth-refresh",
  cookieDomain = "/"
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const token = req.cookies?.[cookieName];
      if (!token) {
        res.status(401).json({ error: "Missing access cookie" });
        return;
      }

      try {
        const payload = jwt.verify(token, COOKIE_SECRET, {
          algorithms: ["HS256"],
        });
        (req as any).user = payload;
        return next();
      } catch (err: any) {
        // expired or invalid token
        if (err.name !== "TokenExpiredError") {
          console.warn("[SeamlessAuth] Invalid token:", err.message);
          res.status(401).json({ error: "Invalid token" });
          return;
        }

        // Try refresh
        const refreshToken = req.cookies?.[refreshCookieName];
        if (!refreshToken) {
          res.status(401).json({ error: "Session expired; re-login required" });
          return;
        }

        console.log("[SeamlessAuth] Access token expired — attempting refresh");
        const refreshed = await refreshAccessToken(
          req,
          AUTH_SERVER_URL,
          refreshToken
        );

        if (!refreshed?.token) {
          res.status(401).json({ error: "Refresh failed" });
          return;
        }

        // Update cookie with new access token
        setSessionCookie(
          res,
          {
            sub: refreshed.sub,
            token: refreshed.token,
            roles: refreshed.roles,
          },
          cookieDomain,
          refreshed.ttl,
          cookieName
        );

        setSessionCookie(
          res,
          { sub: refreshed.sub, refreshToken: refreshed.refreshToken },
          req.hostname,
          refreshed.refreshTtl,
          refreshCookieName
        );

        // Decode new token so downstream has user
        const payload = jwt.verify(refreshed.token, COOKIE_SECRET, {
          algorithms: ["HS256"],
        });
        (req as any).user = payload;
        next();
      }
    } catch (err: any) {
      console.error("[SeamlessAuth] requireAuth error:", err.message);
      res.status(401).json({ error: "Invalid or expired access cookie" });
      return;
    }
  };
}
