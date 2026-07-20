import type { Request } from "express";
import {
  getSeamlessUser as getSeamlessUserCore,
  GetSeamlessUserOptions,
} from "@seamless-auth/core";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "./internal/buildAuthorization";
import { SeamlessAuthServerOptions } from "./createServer";
import { buildForwardedClientIp } from "./internal/buildForwardedClientIp";

export async function getSeamlessUser(
  req: Request,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  return getSeamlessUserCore(req.cookies ?? {}, {
    authServerUrl: opts.authServerUrl,
    cookieSecret: opts.cookieSecret,
    cookieName: opts.accessCookieName ?? "seamless-access",
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  } as GetSeamlessUserOptions);
}
