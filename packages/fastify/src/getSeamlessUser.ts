import type { FastifyRequest } from "fastify";
import { getSeamlessUser as getSeamlessUserCore } from "@seamless-auth/core";

import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "./internal/buildAuthorization";
import { buildForwardedClientIp } from "./internal/buildForwardedClientIp";
import { buildForwardedUserAgent } from "./internal/buildForwardedUserAgent";
import { requestCookies } from "./internal/requestCookies";
import type { SeamlessAuthServerOptions } from "./options";

export async function getSeamlessUser(
  req: FastifyRequest,
  opts: SeamlessAuthServerOptions,
) {
  return getSeamlessUserCore(requestCookies(req), {
    authServerUrl: opts.authServerUrl,
    authServerIssuer: opts.authServerIssuer,
    cookieSecret: opts.cookieSecret,
    cookieName: opts.accessCookieName ?? "seamless-access",
    authorization: buildServiceAuthorization(req),
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    forwardedUserAgent: buildForwardedUserAgent(req),
    // The plugin options always carry the audience, so a request with no cookie
    // but a bearer access token resolves too. Core verifies it before forwarding.
    bearer: { authorization: req.headers?.authorization, audience: opts.audience },
  });
}
