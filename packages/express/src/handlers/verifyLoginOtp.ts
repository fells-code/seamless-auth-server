import { Request, Response } from "express";
import { verifyLoginOtpHandler } from "@seamless-auth/core/handlers/verifyLoginOtpHandler";
import { setSessionCookie } from "../internal/cookie";
import { buildServiceAuthorization } from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";

export async function verifyLoginOtp(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
  kind: "email" | "phone",
) {
  const cookieSigner = {
    secret: opts.cookieSecret,
    secure: process.env.NODE_ENV === "production",
    sameSite:
      process.env.NODE_ENV === "production"
        ? "none"
        : ("lax" as "none" | "lax"),
  };

  const result = await verifyLoginOtpHandler(
    {
      body: req.body,
      authorization: buildServiceAuthorization(req, opts),
      forwardedClientIp: buildForwardedClientIp(req),
      kind,
    },
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

  return res.status(result.status).json(result.body);
}
