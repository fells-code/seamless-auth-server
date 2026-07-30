import type { FastifyRequest } from "fastify";
import { getSeamlessUser as getSeamlessUserCore } from "@seamless-auth/core";

import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "./internal/buildAuthorization";
import { buildForwardedClientIp } from "./internal/buildForwardedClientIp";
import type { SeamlessAuthServerOptions } from "./options";

export async function getSeamlessUser(
  req: FastifyRequest,
  opts: SeamlessAuthServerOptions,
) {
  return getSeamlessUserCore(req.cookies ?? {}, {
    authServerUrl: opts.authServerUrl,
    cookieSecret: opts.cookieSecret,
    cookieName: opts.accessCookieName ?? "seamless-access",
    authorization: buildServiceAuthorization(req),
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });
}
