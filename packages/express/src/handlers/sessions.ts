import { Request, Response } from "express";
import {
  listSessionsHandler,
  revokeSessionHandler,
  revokeAllSessionsHandler,
} from "@seamless-auth/core/handlers/sessions";

import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { respond } from "../internal/respond";
import { SeamlessAuthServerOptions } from "../createServer";

function handle(res: Response, result: any, opts: SeamlessAuthServerOptions) {
  respond(res, result, opts);
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
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  return handle(res, result, opts);
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
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  return handle(res, result, opts);
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
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  return handle(res, result, opts);
}
