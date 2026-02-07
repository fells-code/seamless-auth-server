import { Request, Response } from "express";
import { meHandler } from "@seamless-auth/core/handlers/me";
import { clearSessionCookie } from "../internal/cookie";
import { buildServiceAuthorization } from "../internal/buildAuthorization";
import { SeamlessAuthServerOptions } from "../createServer";

export async function me(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req);
  const result = await meHandler({
    authServerUrl: opts.authServerUrl,
    preAuthCookieName: opts.preAuthCookieName!,
    authorization,
  });

  if (result.clearCookies) {
    for (const name of result.clearCookies) {
      clearSessionCookie(res, opts.cookieDomain || "", name);
    }
  }

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.body);
}
