import { createServiceToken } from "@seamless-auth/core";
import { Request } from "express";
import { SeamlessAuthServerOptions } from "../createServer";

export function buildServiceAuthorization(
  req: Request & { cookiePayload?: any },
  _opts?: SeamlessAuthServerOptions,
) {
  const token = req.cookiePayload?.token || req.user?.token;

  return typeof token === "string" ? `Bearer ${token}` : undefined;
}

export function buildInternalServiceAuthorization(opts: SeamlessAuthServerOptions) {
  const token = createServiceToken({
    subject: "seamless-auth-external-delivery",
    issuer: "seamless-portal-api",
    audience: "seamless-auth",
    serviceSecret: opts.serviceSecret,
    keyId: opts.jwksKid || "dev-main",
  });

  return `Bearer ${token}`;
}

export function buildInternalServiceAuthorization(opts: SeamlessAuthServerOptions) {
  const token = createServiceToken({
    subject: "seamless-auth-external-delivery",
    issuer: "seamless-portal-api",
    audience: "seamless-auth",
    serviceSecret: opts.serviceSecret,
    keyId: opts.jwksKid || "dev-main",
  });

  return `Bearer ${token}`;
}
