import { Request, Response } from "express";
import { respond } from "../internal/respond";
import { requestMagicLinkHandler } from "@seamless-auth/core/handlers/requestMagicLinkHandler";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { applyExternalDelivery } from "@seamless-auth/core";
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
    },
  );

  if (result.errorBody) {
    return respond(res, result, opts);
  }

  const body = await applyExternalDelivery(opts.messaging, result.body);

  respond(res, { ...result, body }, opts);
}
