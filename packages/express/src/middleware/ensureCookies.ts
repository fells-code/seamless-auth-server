import { Request, Response, NextFunction } from "express";
import { ensureCookies, EnsureCookiesResult } from "@seamless-auth/core";

import { setSessionCookie, clearAllCookies } from "../internal/cookie";

export interface EnsureCookiesMiddlewareOptions {
  authServerUrl: string;
  cookieDomain?: string;

  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  preAuthCookieName: string;
  cookieSecret: string;
  serviceSecret: string;
  issuer: string;
  audience: string;
  keyId: string;
}

export function createEnsureCookiesMiddleware(
  opts: EnsureCookiesMiddlewareOptions,
) {
  if (!opts.cookieSecret) {
    throw new Error("Missing cookieSecret");
  }
  if (!opts.serviceSecret) {
    throw new Error("Missing serviceSecret");
  }

  const cookieSigner = {
    secret: opts.cookieSecret,
    secure: process.env.NODE_ENV === "production",
    sameSite:
      process.env.NODE_ENV === "production"
        ? "none"
        : ("lax" as const as "lax" | "none"),
  };

  return async function ensureCookiesMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const result = await ensureCookies(
      {
        path: req.path,
        cookies: req.cookies ?? {},
      },
      {
        authServerUrl: opts.authServerUrl,
        cookieDomain: opts.cookieDomain,
        accessCookieName: opts.accessCookieName,
        registrationCookieName: opts.registrationCookieName,
        refreshCookieName: opts.refreshCookieName,
        preAuthCookieName: opts.preAuthCookieName,
        cookieSecret: opts.cookieSecret,
        serviceSecret: opts.serviceSecret,
        issuer: opts.issuer,
        audience: opts.audience,
        keyId: opts.keyId,
      },
    );

    applyResult(res, req, result, opts, cookieSigner);
    if (result.type === "error") return;
    next();
  };
}

function applyResult(
  res: Response,
  req: any,
  result: EnsureCookiesResult,
  opts: EnsureCookiesMiddlewareOptions,
  cookieSigner: {
    secret: string;
    secure: boolean;
    sameSite: "none" | "lax";
  },
) {
  if (result.clearCookies?.length) {
    clearAllCookies(res, opts.cookieDomain, ...result.clearCookies);
  }

  if (result.setCookies) {
    for (const c of result.setCookies) {
      setSessionCookie(
        res,
        {
          name: c.name,
          payload: c.value,
          domain: c.domain,
          ttlSeconds: c.ttl,
        },
        cookieSigner,
      );
    }
  }

  if (result.user) {
    req.cookiePayload = result.user;
  }

  if (result.type === "error") {
    res.status(result.status ?? 401).json({ error: result.error });
  }
}
