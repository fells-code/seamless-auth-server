import { Request, Response } from "express";
import { requestOtpHandler } from "@seamless-auth/core/handlers/requestOtpHandler";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { applyExternalDelivery } from "../internal/deliverAuthMessage";
import { SeamlessAuthServerOptions } from "../createServer";

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
      externalDelivery: Boolean(opts.messaging),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      serviceAuthorization: opts.messaging
        ? buildInternalServiceAuthorization(opts)
        : buildProxyServiceAuthorization(opts),
    },
  );

  if (result.error) {
    return res.status(result.status).json(result.error);
  }

  const body = await applyExternalDelivery(opts.messaging, result.body);

  return res.status(result.status).json(body);
}
