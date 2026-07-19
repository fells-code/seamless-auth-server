import { Request, Response } from "express";
import { loginHandler } from "@seamless-auth/core/handlers/login";
import { buildCookieSigner, setSessionCookie } from "../internal/cookie";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";

export async function login(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const cookieSigner = buildCookieSigner(opts);

  const result = await loginHandler(
    { body: req.body },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      cookieDomain: opts.cookieDomain,
      preAuthCookieName: opts.preAuthCookieName!,
      forwardedClientIp: buildForwardedClientIp(req),
    } as any,
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

  if (result.body) {
    return res.status(result.status).json(result.body);
  }

  res.status(result.status).end();
}
