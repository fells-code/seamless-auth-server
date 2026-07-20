import { Request, Response, NextFunction } from "express";
import { assertSecretStrength, verifyCookieJwt } from "@seamless-auth/core";
import { SeamlessAuthUser } from "../createServer";

export interface RequireAuthOptions {
  cookieName?: string;
  cookieSecret: string;
}

/**
 * Express middleware that enforces authentication using an already-issued
 * Seamless Auth access cookie.
 *
 * Verifies the signed access cookie, attaches the decoded session payload to
 * `req.user`, and responds 401 when the cookie is missing or invalid.
 *
 * This guard does NOT attempt token refresh. Silent refresh is handled upstream
 * by the ensureCookies() middleware mounted on the `/auth` router.
 *
 * ### Example
 * ```ts
 * const guard = requireAuth({ cookieSecret: process.env.COOKIE_SECRET! });
 *
 * app.get("/api/me", guard, (req, res) => {
 *   res.json({ user: req.user });
 * });
 * ```
 *
 * @param opts - `cookieSecret` (required, must match createSeamlessAuthServer)
 *   and `cookieName` (defaults to `"seamless-access"`).
 *
 * @returns An Express middleware function that enforces authentication.
 */
export function requireAuth(opts: RequireAuthOptions) {
  const { cookieName = "seamless-access", cookieSecret } = opts;

  assertSecretStrength("requireAuth: cookieSecret", cookieSecret);

  return function (req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.[cookieName];

    if (!token) {
      console.warn(
        "[SEAMLESS-AUTH-EXPRESS] - (requireAuth) - Missing expected auth cookie. Ensure you are using `cookieParser` in your express server",
      );
      res.status(401).json({
        error: "Failed to find authentication token required",
      });
      return;
    }

    const payload = verifyCookieJwt(token, cookieSecret);

    if (!payload || !payload.sub) {
      res.status(401).json({
        error: "Invalid or expired session",
      });
      return;
    }

    const user: SeamlessAuthUser = {
      id: payload.sub,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
      email: payload.email,
      phone: payload.phone,
      iat: payload.iat,
      exp: payload.exp,
      token: payload.token,
    };

    req.user = user;
    next();
  };
}
