import { Request, Response, NextFunction } from "express";
import { ensureCookies, EnsureCookiesResult } from "@seamless-auth/core";

import {
  buildForwardedClientIp,
  ClientIpResolver,
} from "../internal/buildForwardedClientIp";
import { assertSecrets } from "../internal/validateSecrets";
import { applyCookies, type CookieSameSite } from "@seamless-auth/core";
import { expressResponseAdapter } from "../internal/respond";

export interface EnsureCookiesMiddlewareOptions {
  authServerUrl: string;
  cookieDomain?: string;
  cookieSecure?: boolean;
  cookieSameSite?: CookieSameSite;

  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  preAuthCookieName: string;
  cookieSecret: string;
  serviceSecret: string;
  issuer: string;
  audience: string;
  keyId: string;
  resolveClientIp?: ClientIpResolver;
}

export function createEnsureCookiesMiddleware(
  opts: EnsureCookiesMiddlewareOptions,
) {
  assertSecrets(opts);

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
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      },
    );

    applyMiddlewareResult(res, req, result, opts);
    if (result.type === "error") return;
    next();
  };
}

function applyMiddlewareResult(
  res: Response,
  req: any,
  result: EnsureCookiesResult,
  opts: EnsureCookiesMiddlewareOptions,
) {
  applyCookies(result, expressResponseAdapter(res), opts);

  if (result.user) {
    req.cookiePayload = result.user;
  }

  if (result.type === "error") {
    res.status(result.status ?? 401).json({ error: result.errorCode });
  }
}
