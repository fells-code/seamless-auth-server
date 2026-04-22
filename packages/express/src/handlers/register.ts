import { Request, Response } from "express";
import { registerHandler } from "@seamless-auth/core/handlers/register";
import { setSessionCookie } from "../internal/cookie";
import { deliverAuthMessage, stripDelivery } from "../internal/deliverAuthMessage";
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
      externalDelivery: Boolean(opts.messaging),
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
