import { Request, Response } from "express";
import { registerHandler } from "@seamless-auth/core/handlers/register";
import { buildCookieSigner, setSessionCookie } from "../internal/cookie";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
} from "../internal/buildAuthorization";
import { deliverAuthMessage, stripDelivery } from "../internal/deliverAuthMessage";
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
    } as any,
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

  if (result.body && typeof result.body === "object" && "delivery" in result.body) {
    await deliverAuthMessage(
      opts.messaging,
      (result.body as { delivery?: any }).delivery,
    );
    return res.status(result.status).json(stripDelivery(result.body as any)).end();
  }

  res.status(result.status).json(result.body).end();
}
