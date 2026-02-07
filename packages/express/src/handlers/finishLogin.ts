import { Request, Response } from "express";
import { finishLoginHandler } from "@seamless-auth/core/handlers/finishLogin";
import { setSessionCookie } from "../internal/cookie";
import { SeamlessAuthServerOptions } from "../types";
import { buildServiceAuthorization } from "../internal/buildAuthorization";

export async function finishLogin(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const cookieSigner = {
    secret: process.env.COOKIE_SIGNING_KEY!,
    secure: process.env.NODE_ENV === "production",
    sameSite:
      process.env.NODE_ENV === "production"
        ? "none"
        : ("lax" as "none" | "lax"),
  };

  const authorization = buildServiceAuthorization(req);

  const result = await finishLoginHandler(
    { body: req.body, authorization },
    {
      authServerUrl: opts.authServerUrl,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
      refreshCookieName: opts.refreshCookieName!,
    },
  );

  if (!cookieSigner.secret) {
    throw new Error("Missing COOKIE_SIGNING_KEY");
  }

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
