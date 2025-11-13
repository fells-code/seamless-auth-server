import jwt from "jsonwebtoken";
import { Request, Response } from "express";


export interface CookiePayload {
  sub: string;
  refreshToken?: string;
  roles?: string[];
}

const COOKIE_SECRET = process.env.SEAMLESS_COOKIE_SIGNING_KEY!;
if (!COOKIE_SECRET) {
  console.warn("[SeamlessAuth] Missing SEAMLESS_COOKIE_SIGNING_KEY env var!");
}

export function setSessionCookie(
  res: Response,
  payload: CookiePayload,
  domain?: string,
  ttlSeconds = 300,
  name = "sa_session"
) {
  const token = jwt.sign(payload, COOKIE_SECRET, {
    algorithm: "HS256",
    expiresIn: ttlSeconds,
  });

  res.cookie(name, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain,
    maxAge: ttlSeconds * 1000,
  });
}

export function clearSessionCookie(res: Response, domain: string, name = "sa_session") {
  res.clearCookie(name, { domain, path: "/" });
}

export function clearAllCookies(res: Response, domain: string, accesscookieName: string, registrationCookieName: string, refreshCookieName: string) {
  res.clearCookie(accesscookieName, { domain, path: "/"});
  res.clearCookie(registrationCookieName, { domain, path: "/"})
  res.clearCookie(refreshCookieName, { domain, path: "/"})
}
