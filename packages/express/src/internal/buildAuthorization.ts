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

// createServiceToken mints a 60s token. Reuse it for slightly less than that so a
// proxied request never signs a fresh JWT, and never presents a token that expires
// in flight.
const PROXY_TOKEN_REUSE_MS = 45_000;

let proxyTokenCache:
  | { authorization: string; secret: string; keyId: string; expiresAt: number }
  | undefined;

// Identifies the adapter itself, not the browser user. The auth API only requires a
// truthy `sub`, so this stays a constant service name with nothing user-derived in it.
const PROXY_TOKEN_SUBJECT = "seamless-auth-express-adapter";

export function buildProxyServiceAuthorization(
  opts: SeamlessAuthServerOptions,
): string | undefined {
  // getSeamlessUser is callable standalone, without the serviceSecret the router
  // requires. Skip the service token there rather than throwing; the auth API simply
  // will not honor the forwarded client IP.
  if (!opts.serviceSecret) {
    return undefined;
  }

  const keyId = opts.jwksKid || "dev-main";
  const now = Date.now();

  if (
    proxyTokenCache &&
    proxyTokenCache.secret === opts.serviceSecret &&
    proxyTokenCache.keyId === keyId &&
    proxyTokenCache.expiresAt > now
  ) {
    return proxyTokenCache.authorization;
  }

  const authorization = `Bearer ${createServiceToken({
    subject: PROXY_TOKEN_SUBJECT,
    issuer: "seamless-portal-api",
    audience: "seamless-auth",
    serviceSecret: opts.serviceSecret,
    keyId,
  })}`;

  proxyTokenCache = {
    authorization,
    secret: opts.serviceSecret,
    keyId,
    expiresAt: now + PROXY_TOKEN_REUSE_MS,
  };

  return authorization;
}

export function buildInternalServiceAuthorization(
  opts: SeamlessAuthServerOptions,
) {
  const token = createServiceToken({
    subject: "seamless-auth-external-delivery",
    issuer: "seamless-portal-api",
    audience: "seamless-auth",
    serviceSecret: opts.serviceSecret,
    keyId: opts.jwksKid || "dev-main",
  });

  return `Bearer ${token}`;
}
