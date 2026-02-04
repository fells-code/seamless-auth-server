import { createServiceToken } from "@seamless-auth/core";
import { Request } from "express";

export function buildServiceAuthorization(
  req: Request & { cookiePayload?: any },
) {
  if (!req.cookiePayload?.sub) {
    return undefined;
  }

  const token = createServiceToken({
    subject: req.cookiePayload.sub,
    issuer: process.env.APP_ORIGIN!,
    audience: process.env.AUTH_SERVER_URL!,
    serviceSecret: process.env.API_SERVICE_TOKEN!,
    keyId: "dev-main",
  });

  return `Bearer ${token}`;
}
