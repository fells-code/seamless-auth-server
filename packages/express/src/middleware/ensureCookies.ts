import { Request, Response, NextFunction } from "express";
import { ensureCookies, EnsureCookiesResult } from "@seamless-auth/core";

import {
  buildForwardedClientIp,
  ClientIpResolver,
} from "../internal/buildForwardedClientIp";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent";
import { assertSecrets } from "../internal/validateSecrets";
import { applyCookies, type CookieSameSite } from "@seamless-auth/core";
import { expressResponseAdapter } from "../internal/respond";
import { transportOf } from "../internal/transport";

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
  /**
   * Audience of the user access tokens the auth API issues, which a silently
   * refreshed token is verified against. Defaults to `authServerUrl`.
   */
  accessTokenAudience?: string;
  /**
   * Expected `iss` on a silently refreshed access token, when the auth server
   * signs under a different issuer from `authServerUrl`. Defaults to
   * `authServerUrl`.
   */
  authServerIssuer?: string;
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
    // A bearer client holds its own tokens and refreshes through /refresh, so
    // there is no cookie here to load or rotate.
    if (transportOf(req) === "bearer") {
      next();
      return;
    }

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
        accessTokenAudience: opts.accessTokenAudience,
        authServerIssuer: opts.authServerIssuer,
        keyId: opts.keyId,
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
        forwardedUserAgent: buildForwardedUserAgent(req),
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
