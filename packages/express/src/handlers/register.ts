import { Request, Response } from "express";
import { registerHandler } from "@seamless-auth/core/handlers/register";
import { buildCookieSigner, setSessionCookie } from "../internal/cookie";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
} from "../internal/buildAuthorization";
import { applyExternalDelivery } from "../internal/deliverAuthMessage";
import { SeamlessAuthServerOptions } from "../createServer";

export async function register(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const cookieSigner = buildCookieSigner(opts);

  const result = await registerHandler(
    { body: req.body },
    {
      authServerUrl: opts.authServerUrl,
      cookieDomain: opts.cookieDomain,
      registrationCookieName: opts.registrationCookieName!,
      externalDelivery: Boolean(opts.messaging),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
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
          domain: c.domain ?? opts.cookieDomain,
          ttlSeconds: c.ttl,
        },
        cookieSigner,
      );
    }
  }

  if (result.error) {
    return res.status(result.status).json(result.error);
  }

  const body = await applyExternalDelivery(opts.messaging, result.body);

  res.status(result.status).json(body).end();
}
