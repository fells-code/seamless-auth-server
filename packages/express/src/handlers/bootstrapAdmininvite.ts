import { Request, Response } from "express";
import { bootstrapAdminInviteHandler } from "@seamless-auth/core/handlers/bootstrapAdminInvite";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
} from "../internal/buildAuthorization";
import { applyExternalDelivery } from "../internal/deliverAuthMessage";
import { SeamlessAuthServerOptions } from "../createServer";

export async function bootstrapAdminInvite(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await bootstrapAdminInviteHandler({
    authServerUrl: opts.authServerUrl,
    email: req.body?.email,
    authorization: req.headers["authorization"],
    externalDelivery: Boolean(opts.messaging),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    serviceAuthorization: opts.messaging
      ? buildInternalServiceAuthorization(opts)
      : buildProxyServiceAuthorization(opts),
  } as any);

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  const body = await applyExternalDelivery(opts.messaging, result.body);

  res.status(result.status).json(body);
}
