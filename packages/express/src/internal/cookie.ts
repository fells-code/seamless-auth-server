import jwt, { JwtPayload } from "jsonwebtoken";
import { Response } from "express";

export type CookieSameSite = "lax" | "none" | "strict";

export interface CookieSignerOptions {
  secret: string;
  secure: boolean;
  sameSite: CookieSameSite;
}

export interface CookieSecurityOptions {
  cookieSecret: string;
  cookieSecure?: boolean;
  cookieSameSite?: CookieSameSite;
}

/**
 * Single source of truth for cookie security policy. Defaults to secure so a deploy
 * cannot silently ship plaintext-visible cookies. Browsers reject `SameSite=None`
 * without `Secure`, so the SameSite default tracks `secure`.
 */
export function buildCookieSigner(
  opts: CookieSecurityOptions,
): CookieSignerOptions {
  if (!opts.cookieSecret) {
    throw new Error("Missing COOKIE_SIGNING_KEY");
  }

  const secure = opts.cookieSecure ?? true;

  return {
    secret: opts.cookieSecret,
    secure,
    sameSite: opts.cookieSameSite ?? (secure ? "none" : "lax"),
  };
}

export interface SetCookieOptions {
  name: string;
  payload: JwtPayload;
  domain?: string;
  ttlSeconds: number;
}

export function setSessionCookie(
  res: Response,
  opts: SetCookieOptions,
  signer: CookieSignerOptions,
) {
  const token = jwt.sign(opts.payload, signer.secret, {
    algorithm: "HS256",
    expiresIn: `${opts.ttlSeconds}s`,
  });

  res.cookie(opts.name, token, {
    httpOnly: true,
    secure: signer.secure,
    sameSite: signer.sameSite,
    path: "/",
    domain: opts.domain,
    maxAge: Number(opts.ttlSeconds) * 1000,
  });
}

export function clearSessionCookie(
  res: Response,
  domain: string | undefined,
  name: string,
) {
  res.clearCookie(name, { domain, path: "/" });
}

export function clearAllCookies(
  res: Response,
  domain: string | undefined,
  ...cookieNames: string[]
) {
  for (const name of cookieNames) {
    res.clearCookie(name, { domain, path: "/" });
  }
}
