import { Request, Response } from "express";
import { pollMagicLinkConfirmationHandler } from "@seamless-auth/core/handlers/pollMagicLinkConfirmationHandler";
import { buildCookieSigner, setSessionCookie } from "../internal/cookie";
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
  const cookieSigner = buildCookieSigner(opts);

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

  if (result.setCookies) {
    for (const c of result.setCookies) {
      setSessionCookie(
        res,
        {
          name: c.name,
          payload: c.value,
          domain: c.domain,
          ttlSeconds: c.ttl,
        },
        cookieSigner,
      );
    }
  }

  if (result.error) {
    return res.status(result.status).json(result.error);
  }

  res.status(result.status).json(result.body).end();
}
