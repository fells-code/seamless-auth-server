import { createServiceToken } from "@seamless-auth/core";
import { Request } from "express";
import { SeamlessAuthServerOptions } from "../createServer";

export function buildServiceAuthorization(
  req: Request & { cookiePayload?: any },
  opts: SeamlessAuthServerOptions,
) {
  if (!req.cookiePayload?.sub && !req.user.sub) {
    return undefined;
  }

  const token = createServiceToken({
    subject: req.cookiePayload?.sub || req.user.sub,
    issuer: opts.issuer,
    audience: opts.audience,
    serviceSecret: opts.serviceSecret,
    keyId: opts.jwksKid || "dev-main",
  });

  return `Bearer ${token}`;
}
