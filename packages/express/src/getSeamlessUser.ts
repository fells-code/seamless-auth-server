import type { Request } from "express";
import { getSeamlessUser as getSeamlessUserCore } from "@seamless-auth/core";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "./internal/buildAuthorization";
import { SeamlessAuthServerOptions } from "./createServer";
import { buildForwardedClientIp } from "./internal/buildForwardedClientIp";
import { buildForwardedUserAgent } from "./internal/buildForwardedUserAgent";

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
    forwardedUserAgent: buildForwardedUserAgent(req),
    // The router options always carry the audience, so a request with no cookie
    // but a bearer access token resolves too. Core verifies it before forwarding.
    bearer: { authorization: req.headers?.authorization, audience: opts.audience },
  });
}
