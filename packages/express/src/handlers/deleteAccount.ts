import { Request, Response } from "express";
import { deleteAccountHandler } from "@seamless-auth/core/handlers/deleteAccount";
import { respond } from "../internal/respond";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent";
import { SeamlessAuthServerOptions } from "../createServer";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";

export async function deleteAccount(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await deleteAccountHandler({
    authServerUrl: opts.authServerUrl,
    accessCookieName: opts.accessCookieName!,
    registrationCookieName: opts.registrationCookieName!,
    refreshCookieName: opts.refreshCookieName!,
    authorization: buildServiceAuthorization(req, opts),
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    forwardedUserAgent: buildForwardedUserAgent(req),
  });

  respond(res, result, opts);
}
