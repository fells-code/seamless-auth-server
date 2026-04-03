import { Request, Response } from "express";
import { bootstrapAdminInviteHandler } from "@seamless-auth/core/handlers/bootstrapAdminInvite";
import { buildServiceAuthorization } from "../internal/buildAuthorization";
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
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.body);
}
