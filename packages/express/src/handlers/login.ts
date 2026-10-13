import { Request, Response } from "express";
import { loginHandler } from "@seamless-auth/core/handlers/login";
import { respond } from "../internal/respond.js";
import { transportOf } from "../internal/transport.js";
import { buildProxyServiceAuthorization } from "../internal/buildAuthorization.js";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp.js";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent.js";
import { SeamlessAuthServerOptions } from "../createServer.js";

export async function login(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await loginHandler(
    { body: req.body },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      authServerIssuer: opts.authServerIssuer,
      cookieDomain: opts.cookieDomain,
      preAuthCookieName: opts.preAuthCookieName!,
      transport: transportOf(req),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      forwardedUserAgent: buildForwardedUserAgent(req),
    },
  );

  respond(res, result, opts);
}
