import {
  buildExternalDeliveryAuthorization,
  createServiceToken,
  DEV_JWKS_KID,
  extractBearerToken,
  SERVICE_TOKEN_AUDIENCE,
  SERVICE_TOKEN_ISSUER,
} from "@seamless-auth/core";

import type { SeamlessAuthHandlerOptions } from "../options";
import type { AuthContext } from "./context";

/**
 * The `Authorization` a proxied call presents upstream on the user's behalf.
 *
 * Cookie transport takes the token out of the verified cookie payload. Bearer
 * transport forwards the token the client sent, as-is: the auth API is the one
 * that decides whether it is the right kind for the route.
 */
export function buildServiceAuthorization(ctx: AuthContext): string | undefined {
  if (ctx.transport === "bearer") {
    const token = extractBearerToken(
      ctx.request.headers.get("authorization") ?? undefined,
    );
    return token ? `Bearer ${token}` : undefined;
  }

  const token = ctx.cookiePayload?.token;

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
const PROXY_TOKEN_SUBJECT = "seamless-auth-nextjs-adapter";

export function buildProxyServiceAuthorization(opts: {
  serviceSecret?: string;
  jwksKid?: string;
}): string | undefined {
  // The session helpers are callable without the serviceSecret the handler
  // requires. Skip the service token there rather than throwing; the auth API
  // simply will not honor the forwarded client details.
  if (!opts.serviceSecret) {
    return undefined;
  }

  const keyId = opts.jwksKid || DEV_JWKS_KID;
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
    issuer: SERVICE_TOKEN_ISSUER,
    audience: SERVICE_TOKEN_AUDIENCE,
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
  opts: Pick<SeamlessAuthHandlerOptions, "serviceSecret" | "jwksKid">,
) {
  return buildExternalDeliveryAuthorization(opts);
}
