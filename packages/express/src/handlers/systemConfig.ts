import { Request, Response } from "express";
import {
  getAvailableRolesHandler,
  getPublicSystemConfigHandler,
  getSystemConfigAdminHandler,
  updateSystemConfigHandler,
} from "@seamless-auth/core/handlers/systemConfig";

import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { respond } from "../internal/respond";
import { SeamlessAuthServerOptions } from "../createServer";

// No identity is built for this one. It is called by a signed-out browser, so
// there is no session to forward, and buildServiceAuthorization would only add a
// header upstream ignores on a public route.
export async function getPublicSystemConfig(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await getPublicSystemConfigHandler({
    authServerUrl: opts.authServerUrl,
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  respond(res, result, opts);
}

export async function getAvailableRoles(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await getAvailableRolesHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  respond(res, result, opts);
}

export async function getSystemConfigAdmin(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await getSystemConfigAdminHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  respond(res, result, opts);
}

export async function updateSystemConfig(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await updateSystemConfigHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
    payload: req.body,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  respond(res, result, opts);
}
