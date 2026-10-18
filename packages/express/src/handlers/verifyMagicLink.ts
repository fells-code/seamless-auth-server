import { Request, Response } from "express";
import {
  magicLinkVerifyAuthorization,
  verifyMagicLinkHandler,
} from "@seamless-auth/core/handlers/verifyMagicLinkHandler";
import { respond } from "../internal/respond.js";
import { transportOf } from "../internal/transport.js";
import { buildProxyServiceAuthorization } from "../internal/buildAuthorization.js";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp.js";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent.js";
import { SeamlessAuthServerOptions } from "../createServer.js";

export async function verifyMagicLink(
  req: Request,
  res: Response,
  token: string,
  opts: SeamlessAuthServerOptions,
) {
  const result = await verifyMagicLinkHandler(
    {
      token,
      authorization: magicLinkVerifyAuthorization({
        transport: transportOf(req),
        authorizationHeader: req.headers?.authorization,
        preAuthCookie: req.cookies?.[opts.preAuthCookieName!],
        cookieSecret: opts.cookieSecret,
      }),
    },
    {
      authServerUrl: opts.authServerUrl,
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      forwardedUserAgent: buildForwardedUserAgent(req),
    },
  );

  respond(res, result, opts);
}
