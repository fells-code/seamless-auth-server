import { Request, Response } from "express";
import { pollMagicLinkConfirmationHandler } from "@seamless-auth/core/handlers/pollMagicLinkConfirmationHandler";
import { respond } from "../internal/respond.js";
import { transportOf } from "../internal/transport.js";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization.js";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp.js";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent.js";
import { SeamlessAuthServerOptions } from "../createServer.js";

export async function pollMagicLinkConfirmation(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await pollMagicLinkConfirmationHandler(
    {
      authorization,
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      forwardedUserAgent: buildForwardedUserAgent(req),
    },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      authServerIssuer: opts.authServerIssuer,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
      refreshCookieName: opts.refreshCookieName!,
      transport: transportOf(req),
      serviceAuthorization: opts.messaging
        ? buildInternalServiceAuthorization(opts)
        : buildProxyServiceAuthorization(opts),
    },
  );

  respond(res, result, opts);
}
