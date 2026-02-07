import { Request, Response } from "express";
import { registerHandler } from "@seamless-auth/core/handlers/register";
import { setSessionCookie } from "../internal/cookie";
import { SeamlessAuthServerOptions } from "../createServer";

export async function register(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const cookieSigner = {
    secret: opts.cookieSecret,
    secure: process.env.NODE_ENV === "production",
    sameSite:
      process.env.NODE_ENV === "production"
        ? "none"
        : ("lax" as "none" | "lax"),
  };

  const result = await registerHandler(
    { body: req.body },
    {
      authServerUrl: opts.authServerUrl,
      cookieDomain: opts.cookieDomain,
      registrationCookieName: opts.registrationCookieName!,
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
          name: opts.registrationCookieName || "seamless-auth-registraion",
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
