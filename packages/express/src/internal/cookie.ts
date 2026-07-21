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
 * Resolves the effective `SameSite` policy from the security options. Shared so the
 * cookie attributes and any policy that keys off `SameSite=None` cannot drift.
 * Browsers reject `SameSite=None` without `Secure`, so the default tracks `secure`.
 */
export function resolveCookieSameSite(
  opts: Pick<CookieSecurityOptions, "cookieSecure" | "cookieSameSite">,
): CookieSameSite {
  const secure = opts.cookieSecure ?? true;
  return opts.cookieSameSite ?? (secure ? "none" : "lax");
}

/**
 * Single source of truth for cookie security policy. Defaults to secure so a deploy
 * cannot silently ship plaintext-visible cookies.
 */
export function buildCookieSigner(
  opts: CookieSecurityOptions,
): CookieSignerOptions {
  if (!opts.cookieSecret) {
    throw new Error("Missing cookieSecret");
  }

  return {
    secret: opts.cookieSecret,
    secure: opts.cookieSecure ?? true,
    sameSite: resolveCookieSameSite(opts),
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

/**
 * Express's clearCookie only forces `expires`, so the attributes must mirror the
 * set path. A clearing header without `Secure; SameSite=None` is dropped by the
 * browser in a cross-site response, leaving the session cookie in place.
 */
export function clearSessionCookie(
  res: Response,
  signer: CookieSignerOptions,
  domain: string | undefined,
  name: string,
) {
  res.clearCookie(name, {
    secure: signer.secure,
    sameSite: signer.sameSite,
    domain,
    path: "/",
  });
}

export function clearAllCookies(
  res: Response,
  signer: CookieSignerOptions,
  domain: string | undefined,
  ...cookieNames: string[]
) {
  for (const name of cookieNames) {
    clearSessionCookie(res, signer, domain, name);
  }
}
