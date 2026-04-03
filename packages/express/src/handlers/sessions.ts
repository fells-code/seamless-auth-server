import { Request, Response } from "express";
import {
  listSessionsHandler,
  revokeSessionHandler,
  revokeAllSessionsHandler,
} from "@seamless-auth/core/handlers/sessions";

import { buildServiceAuthorization } from "../internal/buildAuthorization";
import { SeamlessAuthServerOptions } from "../createServer";

function handle(res: Response, result: any) {
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json(result.body);
}

export async function listSessions(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await listSessionsHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
  });

  return handle(res, result);
}

export async function revokeSession(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await revokeSessionHandler(req.params.id as string, {
    authServerUrl: opts.authServerUrl,
    authorization,
  });

  return handle(res, result);
}

export async function revokeAllSessions(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await revokeAllSessionsHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
  });

  return handle(res, result);
}
