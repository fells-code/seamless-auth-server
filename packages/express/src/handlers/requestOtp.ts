import { Request, Response } from "express";
import { respond } from "../internal/respond.js";
import { requestOtpHandler } from "@seamless-auth/core/handlers/requestOtpHandler";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization.js";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp.js";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent.js";
import { transportOf } from "../internal/transport.js";
import { applyExternalDelivery } from "@seamless-auth/core";
import { SeamlessAuthServerOptions } from "../createServer.js";

export async function requestOtp(
  req: Request & { cookiePayload?: any; user?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
  kind: "email" | "phone",
  flow: "registration" | "login" = "registration",
) {
  const result = await requestOtpHandler(
    {
      kind,
      flow,
      authorization: buildServiceAuthorization(req, opts),
    },
    {
      authServerUrl: opts.authServerUrl,
      transport: transportOf(req),
      externalDelivery: Boolean(opts.messaging),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      forwardedUserAgent: buildForwardedUserAgent(req),
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
