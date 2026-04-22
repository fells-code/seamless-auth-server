import { createServiceToken } from "@seamless-auth/core";
import { Request } from "express";
import { SeamlessAuthServerOptions } from "../createServer";

export function buildServiceAuthorization(
  req: Request & { cookiePayload?: any },
  opts: SeamlessAuthServerOptions,
) {
  const subject = req.cookiePayload?.sub || req.user?.sub;

  if (!subject) {
    return undefined;
  }

  const token = createServiceToken({
    subject,
    issuer: opts.issuer,
    audience: opts.audience,
    serviceSecret: opts.serviceSecret,
    keyId: opts.jwksKid || "dev-main",
  });

  return `Bearer ${token}`;
}
