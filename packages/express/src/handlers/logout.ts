import { Request, Response } from "express";
import { logoutHandler } from "@seamless-auth/core/handlers/logout";
import type { LogoutScope } from "@seamless-auth/core/handlers/logout";
import { clearAllCookies } from "../internal/cookie";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";

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
    scope,
  });

  clearAllCookies(res, opts.cookieDomain || "", ...result.clearCookies);

  res.status(result.status).end();
}
