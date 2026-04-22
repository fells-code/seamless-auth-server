import { Request, Response } from "express";
import { bootstrapAdminInviteHandler } from "@seamless-auth/core/handlers/bootstrapAdminInvite";
import { deliverAuthMessage, stripDelivery } from "../internal/deliverAuthMessage";
import { SeamlessAuthServerOptions } from "../createServer";

export async function bootstrapAdminInvite(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await bootstrapAdminInviteHandler({
    authServerUrl: opts.authServerUrl,
    email: req.body.email,
    authorization: req.headers["authorization"],
    externalDelivery: Boolean(opts.messaging),
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  if (result.body && typeof result.body === "object" && "delivery" in result.body) {
    await deliverAuthMessage(
      opts.messaging,
      (result.body as { delivery?: any }).delivery,
    );
    return res.status(result.status).json(stripDelivery(result.body as any));
  }

  res.status(result.status).json(result.body);
}
