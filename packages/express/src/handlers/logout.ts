import { Request, Response } from "express";
import { logoutHandler } from "@seamless-auth/core/handlers/logout";
import type { LogoutScope } from "@seamless-auth/core/handlers/logout";
import { respond } from "../internal/respond.js";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp.js";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent.js";
import { SeamlessAuthServerOptions } from "../createServer.js";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization.js";

export async function logout(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
  scope: LogoutScope = "current_session",
) {
  const result = await logoutHandler({
    authServerUrl: opts.authServerUrl,
    accessCookieName: opts.accessCookieName!,
    registrationCookieName: opts.registrationCookieName!,
    refreshCookieName: opts.refreshCookieName!,
    authorization: buildServiceAuthorization(req, opts),
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    forwardedUserAgent: buildForwardedUserAgent(req),
    scope,
  });

  respond(res, result, opts);
}
