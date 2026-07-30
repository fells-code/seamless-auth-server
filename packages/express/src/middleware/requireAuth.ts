import { Request, Response, NextFunction } from "express";
import { assertSecretStrength, authenticateCookie } from "@seamless-auth/core";

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

  // Eagerly, so a weak secret fails at setup rather than on the first request.
  assertSecretStrength("requireAuth: cookieSecret", cookieSecret);

  return function (req: Request, res: Response, next: NextFunction) {
    const { user, rejection } = authenticateCookie({
      token: req.cookies?.[cookieName],
      cookieSecret,
    });

    if (rejection) {
      if (rejection.warn) {
        console.warn(
          `[SEAMLESS-AUTH-EXPRESS] - (requireAuth) - ${rejection.warn} Ensure you are using \`cookieParser\` in your express server`,
        );
      }

      res.status(rejection.status).json({ error: rejection.errorCode });
      return;
    }

    req.user = user;
    next();
  };
}
