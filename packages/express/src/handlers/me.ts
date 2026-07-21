import { Request, Response } from "express";
import { meHandler } from "@seamless-auth/core/handlers/me";
import { buildCookieSigner, clearSessionCookie } from "../internal/cookie";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";

export async function me(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);
  const result = await meHandler({
    authServerUrl: opts.authServerUrl,
    preAuthCookieName: opts.preAuthCookieName!,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  if (result.clearCookies) {
    const signer = buildCookieSigner(opts);
    for (const name of result.clearCookies) {
      clearSessionCookie(res, signer, opts.cookieDomain || "", name);
    }
  }

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.body);
}
