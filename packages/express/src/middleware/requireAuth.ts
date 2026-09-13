import { Request, Response, NextFunction } from "express";
import { assertSecretStrength, authenticateRequest } from "@seamless-auth/core";

export interface RequireAuthOptions {
  cookieName?: string;
  cookieSecret: string;
  /**
   * Together with `audience`, lets the guard accept the auth API's own access
   * token in `Authorization: Bearer`, which is how a native client with no
   * cookie jar authenticates. Leave both out and the guard accepts cookies
   * only, as it always has.
   */
  authServerUrl?: string;
  /** Expected `aud` on a bearer access token. Usually the same value as `authServerUrl`. */
  audience?: string;
}

/**
 * Express middleware that enforces authentication using an already-issued
 * Seamless Auth session: the signed access cookie, or, when `authServerUrl` and
 * `audience` are configured, a bearer access token from the auth API.
 *
 * Attaches the decoded session to `req.user` and responds 401 when the
 * credential is missing or invalid. A cookie takes precedence when present.
 *
 * This guard does NOT attempt token refresh. Silent refresh is handled upstream
 * by the ensureCookies() middleware mounted on the `/auth` router; a bearer
 * client refreshes through `POST /auth/refresh` itself.
 *
 * ### Example
 * ```ts
 * const guard = requireAuth({
 *   cookieSecret: process.env.COOKIE_SECRET!,
 *   authServerUrl: process.env.AUTH_SERVER_URL,
 *   audience: process.env.AUTH_SERVER_URL,
 * });
 *
 * app.get("/api/me", guard, (req, res) => {
 *   res.json({ user: req.user });
 * });
 * ```
 *
 * @param opts - `cookieSecret` (required, must match createSeamlessAuthServer),
 *   `cookieName` (defaults to `"seamless-access"`), and the optional
 *   `authServerUrl` + `audience` pair that enables bearer tokens.
 *
 * @returns An Express middleware function that enforces authentication.
 */
export function requireAuth(opts: RequireAuthOptions) {
  const {
    cookieName = "seamless-access",
    cookieSecret,
    authServerUrl,
    audience,
  } = opts;

  // Eagerly, so a weak secret fails at setup rather than on the first request.
  assertSecretStrength("requireAuth: cookieSecret", cookieSecret);

  if ((authServerUrl === undefined) !== (audience === undefined)) {
    throw new Error(
      "requireAuth: authServerUrl and audience must be configured together to accept bearer tokens",
    );
  }

  const bearer =
    authServerUrl !== undefined && audience !== undefined
      ? { authServerUrl, audience }
      : undefined;

  const hint = bearer
    ? "Ensure you are using `cookieParser` in your express server, or that the client sends an `Authorization: Bearer` access token"
    : "Ensure you are using `cookieParser` in your express server";

  return async function (req: Request, res: Response, next: NextFunction) {
    const { user, rejection } = await authenticateRequest({
      token: req.cookies?.[cookieName],
      cookieSecret,
      authorization: req.headers.authorization,
      bearer,
    });

    if (rejection) {
      if (rejection.warn) {
        console.warn(
          `[SEAMLESS-AUTH-EXPRESS] - (requireAuth) - ${rejection.warn} ${hint}`,
        );
      }

      res.status(rejection.status).json({ error: rejection.errorCode });
      return;
    }

    req.user = user;
    next();
  };
}
