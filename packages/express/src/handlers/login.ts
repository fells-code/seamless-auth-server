import { Request, Response } from "express";
import { loginHandler } from "@seamless-auth/core/handlers/login";
import { setSessionCookie } from "../internal/cookie";
import { SeamlessAuthServerOptions } from "../types";

export async function login(
  req: Request,
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

  const result = await loginHandler(
    { body: req.body },
    {
      authServerUrl: opts.authServerUrl,
      cookieDomain: opts.cookieDomain,
      preAuthCookieName: opts.preAuthCookieName!,
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

  res.status(result.status).end();
}
