import { Request, Response } from "express";
import { requestMagicLinkHandler } from "@seamless-auth/core/handlers/requestMagicLinkHandler";
import { buildServiceAuthorization } from "../internal/buildAuthorization";
import { deliverAuthMessage, stripDelivery } from "../internal/deliverAuthMessage";
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
