import { Request, Response } from "express";
import { requestMagicLinkHandler } from "@seamless-auth/core/handlers/requestMagicLinkHandler";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { applyExternalDelivery } from "../internal/deliverAuthMessage";
import { SeamlessAuthServerOptions } from "../createServer";

export async function requestMagicLink(
  req: Request & { cookiePayload?: any; user?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await requestMagicLinkHandler(
    {
      authorization: buildServiceAuthorization(req, opts),
    },
    {
      authServerUrl: opts.authServerUrl,
      externalDelivery: Boolean(opts.messaging),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      serviceAuthorization: opts.messaging
        ? buildInternalServiceAuthorization(opts)
        : buildProxyServiceAuthorization(opts),
    } as any,
  );

  if (result.error) {
    return res.status(result.status).json(result.error);
  }

  const body = await applyExternalDelivery(opts.messaging, result.body);

  return res.status(result.status).json(body);
}
