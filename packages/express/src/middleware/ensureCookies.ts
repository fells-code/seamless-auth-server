import { NextFunction, Request, Response } from "express";
import { SeamlessAuthServerOptions } from "../types";
import { verifyCookieJwt } from "../internal/verifyCookieJwt.js";
import { JwtPayload } from "jsonwebtoken";

export interface CookieRequest extends Request {
  cookiePayload?: JwtPayload;
}

export function createEnsureCookiesMiddleware(opts: SeamlessAuthServerOptions) {
 const COOKIE_REQUIREMENTS: Record<string, { name: string; required: boolean }> = {
    "/webAuthn/login/finish": { name: opts.preAuthCookieName!, required: true },
    "/webAuthn/login/start": { name: opts.preAuthCookieName!, required: true },
    "/webAuthn/register/start": { name: opts.registrationCookieName!, required: true },
    "/webAuthn/register/finish": { name: opts.registrationCookieName!, required: true },
    "/otp/verify-email-otp": { name: opts.registrationCookieName!, required: true },
    "/otp/verify-phone-otp": { name: opts.registrationCookieName!, required: true },
    "/logout": { name: opts.accesscookieName!, required: true },
    "/users/me": { name: opts.accesscookieName!, required: true },
  };
    return function ensureCookies(
    req: CookieRequest,
    res: Response,
    next: NextFunction
  ) {
  const match = Object.entries(COOKIE_REQUIREMENTS).find(([path]) => req.path.startsWith(path));
  if (!match) return next();

  const [, { name, required }] = match;
  const cookieValue = req.cookies?.[name];

  if (required && !cookieValue) {
    return res.status(400).json({
      error: `Missing required cookie "${name}" for route ${req.path}`,
      hint: "Did you forget to call /auth/login/start first?",
    });
  }

  const payload = verifyCookieJwt(cookieValue);
    if (!payload) {
      return res.status(401).json({ error: `Invalid or expired ${name} cookie` });
    }

  req.cookiePayload = payload;
  next();
}
}