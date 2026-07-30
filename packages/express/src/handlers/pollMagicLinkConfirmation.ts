import { Request, Response } from "express";
import { pollMagicLinkConfirmationHandler } from "@seamless-auth/core/handlers/pollMagicLinkConfirmationHandler";
import { respond } from "../internal/respond";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";

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
    },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
      refreshCookieName: opts.refreshCookieName!,
      serviceAuthorization: opts.messaging
        ? buildInternalServiceAuthorization(opts)
        : buildProxyServiceAuthorization(opts),
    },
  );

  respond(res, result, opts);
}
