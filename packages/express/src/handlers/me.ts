import { Request, Response } from "express";
import { meHandler } from "@seamless-auth/core/handlers/me";
import { respond } from "../internal/respond";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";

export async function me(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);
  const result = await meHandler({
    authServerUrl: opts.authServerUrl,
    preAuthCookieName: opts.preAuthCookieName!,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  respond(res, result, opts);
}
