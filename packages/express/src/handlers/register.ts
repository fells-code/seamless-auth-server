import { Request, Response } from "express";
import { registerHandler } from "@seamless-auth/core/handlers/register";
import { respond } from "../internal/respond.js";
import { transportOf } from "../internal/transport.js";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp.js";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent.js";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
} from "../internal/buildAuthorization.js";
import { applyExternalDelivery } from "@seamless-auth/core";
import { SeamlessAuthServerOptions } from "../createServer.js";

export async function register(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await registerHandler(
    { body: req.body },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      authServerIssuer: opts.authServerIssuer,
      cookieDomain: opts.cookieDomain,
      registrationCookieName: opts.registrationCookieName!,
      transport: transportOf(req),
      externalDelivery: Boolean(opts.messaging),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      forwardedUserAgent: buildForwardedUserAgent(req),
      serviceAuthorization: opts.messaging
        ? buildInternalServiceAuthorization(opts)
        : buildProxyServiceAuthorization(opts),
    },
  );

  if (result.errorBody || result.errorCode) {
    return respond(res, result, opts);
  }

  const body = await applyExternalDelivery(opts.messaging, result.body);

  respond(res, { ...result, body }, opts);
}
