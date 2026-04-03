import { Request, Response } from "express";
import {
  getAvailableRolesHandler,
  getSystemConfigAdminHandler,
  updateSystemConfigHandler,
} from "@seamless-auth/core/handlers/systemConfig";

import { buildServiceAuthorization } from "../internal/buildAuthorization";
import { SeamlessAuthServerOptions } from "../createServer";

export async function getAvailableRoles(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await getAvailableRolesHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.body);
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
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.body);
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
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.body);
}
