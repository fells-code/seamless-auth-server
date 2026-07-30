import { Request, Response } from "express";
import {
  verifyLoginOtpHandler,
  verifyRegistrationOtpHandler,
} from "@seamless-auth/core/handlers/verifyLoginOtpHandler";
import { respond } from "../internal/respond";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";

async function verifyOtp(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
  kind: "email" | "phone",
  flow: "login" | "register",
) {
  const handler =
    flow === "register" ? verifyRegistrationOtpHandler : verifyLoginOtpHandler;

  const result = await handler(
    {
      body: req.body,
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      kind,
    },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
      refreshCookieName: opts.refreshCookieName!,
    },
  );

  respond(res, result, opts);
}

export function verifyLoginOtp(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
  kind: "email" | "phone",
) {
  return verifyOtp(req, res, opts, kind, "login");
}

// Registration OTP verify: identical cookie handling, but a successful email
// verify now completes registration and issues a session, so the session cookies
// must be set here (a phone-first step that returns no session sets none).
export function verifyRegistrationOtp(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
  kind: "email" | "phone",
) {
  return verifyOtp(req, res, opts, kind, "register");
}
