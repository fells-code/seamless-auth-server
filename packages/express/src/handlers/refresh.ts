import { Request, Response } from "express";
import { refreshHandler } from "@seamless-auth/core/handlers/refresh";
import { respond } from "../internal/respond";
import { transportOf } from "../internal/transport";
import { buildProxyServiceAuthorization } from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent";
import { SeamlessAuthServerOptions } from "../createServer";

export async function refresh(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await refreshHandler(
    {
      transport: transportOf(req),
      authorization: req.headers.authorization,
      refreshCookie: req.cookies?.[opts.refreshCookieName!],
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      forwardedUserAgent: buildForwardedUserAgent(req),
    },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      cookieSecret: opts.cookieSecret,
      serviceSecret: opts.serviceSecret,
      keyId: opts.jwksKid!,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
      refreshCookieName: opts.refreshCookieName!,
    },
  );

  respond(res, result, opts);
}
