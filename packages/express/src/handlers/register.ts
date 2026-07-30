import { Request, Response } from "express";
import { registerHandler } from "@seamless-auth/core/handlers/register";
import { respond } from "../internal/respond";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
} from "../internal/buildAuthorization";
import { applyExternalDelivery } from "@seamless-auth/core";
import { SeamlessAuthServerOptions } from "../createServer";

export async function register(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await registerHandler(
    { body: req.body },
    {
      authServerUrl: opts.authServerUrl,
      cookieDomain: opts.cookieDomain,
      registrationCookieName: opts.registrationCookieName!,
      externalDelivery: Boolean(opts.messaging),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      serviceAuthorization: opts.messaging
        ? buildInternalServiceAuthorization(opts)
        : buildProxyServiceAuthorization(opts),
    },
  );

  if (result.errorBody) {
    return respond(res, result, opts);
  }

  const body = await applyExternalDelivery(opts.messaging, result.body);

  respond(res, { ...result, body }, opts);
}
