import { Request, Response } from "express";
import { requestOtpHandler } from "@seamless-auth/core/handlers/requestOtpHandler";
import {
  buildInternalServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { deliverAuthMessage, stripDelivery } from "../internal/deliverAuthMessage";
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
      forwardedClientIp: buildForwardedClientIp(req),
      serviceAuthorization: opts.messaging
        ? buildInternalServiceAuthorization(opts)
        : undefined,
    } as any,
  );

  if (result.error) {
    return res.status(result.status).json(result.error);
  }

  if (result.body && typeof result.body === "object" && "delivery" in result.body) {
    await deliverAuthMessage(
      opts.messaging,
      (result.body as { delivery?: any }).delivery,
    );
    return res.status(result.status).json(stripDelivery(result.body as any));
  }

  return res.status(result.status).json(result.body);
}
