import { Request, Response } from "express";
import { requestOtpHandler } from "@seamless-auth/core/handlers/requestOtpHandler";
import { buildServiceAuthorization } from "../internal/buildAuthorization";
import { deliverAuthMessage, stripDelivery } from "../internal/deliverAuthMessage";
import { SeamlessAuthServerOptions } from "../createServer";

export async function requestOtp(
  req: Request & { cookiePayload?: any; user?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
  kind: "email" | "phone",
) {
  const result = await requestOtpHandler(
    {
      kind,
      authorization: buildServiceAuthorization(req, opts),
    },
    {
      authServerUrl: opts.authServerUrl,
      externalDelivery: Boolean(opts.messaging),
    },
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
