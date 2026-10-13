import { Request, Response } from "express";
import { finishLoginHandler } from "@seamless-auth/core/handlers/finishLogin";
import { respond } from "../internal/respond.js";
import { transportOf } from "../internal/transport.js";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization.js";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp.js";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent.js";
import { SeamlessAuthServerOptions } from "../createServer.js";

export async function finishLogin(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await finishLoginHandler(
    {
      body: req.body,
      authorization,
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      forwardedUserAgent: buildForwardedUserAgent(req),
    },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      authServerIssuer: opts.authServerIssuer,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
      refreshCookieName: opts.refreshCookieName!,
      transport: transportOf(req),
    },
  );

  respond(res, result, opts);
}
