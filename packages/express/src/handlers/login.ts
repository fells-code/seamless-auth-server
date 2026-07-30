import { Request, Response } from "express";
import { loginHandler } from "@seamless-auth/core/handlers/login";
import { respond } from "../internal/respond";
import { buildProxyServiceAuthorization } from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";

export async function login(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await loginHandler(
    { body: req.body },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      cookieDomain: opts.cookieDomain,
      preAuthCookieName: opts.preAuthCookieName!,
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    },
  );

  respond(res, result, opts);
}
