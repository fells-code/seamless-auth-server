import { NextFunction, Request, Response } from "express";
import { SeamlessAuthServerOptions } from "../types";
import jwt from "jsonwebtoken";

import { verifyCookieJwt } from "../internal/verifyCookieJwt.js";
import { JwtPayload } from "jsonwebtoken";
import { refreshAccessToken } from "../internal/refreshAccessToken";
import { clearAllCookies, setSessionCookie } from "../internal/cookie";

const AUTH_SERVER_URL = process.env.AUTH_SERVER!;

const COOKIE_SECRET = process.env.SEAMLESS_COOKIE_SIGNING_KEY!;
if (!COOKIE_SECRET) {
  console.warn(
    "[SeamlessAuth] SEAMLESS_COOKIE_SIGNING_KEY missing — requireAuth will always fail."
  );
}
export interface CookieRequest extends Request {
  cookiePayload?: JwtPayload;
}

export function createEnsureCookiesMiddleware(opts: SeamlessAuthServerOptions) {
  const COOKIE_REQUIREMENTS: Record<
    string,
    { name: string; required: boolean }
  > = {
    "/webAuthn/login/finish": { name: opts.preAuthCookieName!, required: true },
    "/webAuthn/login/start": { name: opts.preAuthCookieName!, required: true },
    "/webAuthn/register/start": {
      name: opts.registrationCookieName!,
      required: true,
    },
    "/webAuthn/register/finish": {
      name: opts.registrationCookieName!,
      required: true,
    },
    "/otp/verify-email-otp": {
      name: opts.registrationCookieName!,
      required: true,
    },
    "/otp/verify-phone-otp": {
      name: opts.registrationCookieName!,
      required: true,
    },
    "/logout": { name: opts.accesscookieName!, required: true },
    "/users/me": { name: opts.accesscookieName!, required: true },
  };

  return async function ensureCookies(
    req: CookieRequest,
    res: Response,
    next: NextFunction,
    cookieDomain = ""
  ) {
    const match = Object.entries(COOKIE_REQUIREMENTS).find(([path]) =>
      req.path.startsWith(path)
    );
    if (!match) return next();

    const [, { name, required }] = match;

    const cookieValue = req.cookies?.[name];
    const refreshCookieValue = req.cookies?.[opts.refreshCookieName!];

    //
    // --- NEW REFRESH-AWARE LOGIC ---
    //
    // If required cookie is missing BUT refresh cookie exists,
    // allow request to proceed. requireAuth() will perform refresh.
    //
    if (required && !cookieValue) {
      if (refreshCookieValue) {
        console.log("[SeamlessAuth] Access token expired — attempting refresh");
        const refreshed = await refreshAccessToken(
          req,
          AUTH_SERVER_URL,
          refreshCookieValue
        );

        if (!refreshed?.token) {
          clearAllCookies(
            res,
            cookieDomain,
            name,
            opts.registrationCookieName!,
            opts.refreshCookieName!
          );
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
          name
        );

        setSessionCookie(
          res,
          { sub: refreshed.sub, refreshToken: refreshed.refreshToken },
          cookieDomain,
          refreshed.refreshTtl,
          opts.refreshCookieName!
        );

        // Let requireAuth() attempt refresh
        req.cookiePayload = {
          sub: refreshed.sub,
          roles: refreshed.roles,
        };
        return next();
      }

      // No required cookie AND no refresh cookie → hard fail
      return res.status(400).json({
        error: `Missing required cookie "${name}" for route ${req.path}`,
        hint: "Did you forget to call /auth/login/start first?",
      });
    }

    //
    // If cookie exists, verify it normally
    //
    if (cookieValue) {
      const payload = verifyCookieJwt(cookieValue);
      if (!payload) {
        return res
          .status(401)
          .json({ error: `Invalid or expired ${name} cookie` });
      }

      req.cookiePayload = payload;
    }

    next();
  };
}
