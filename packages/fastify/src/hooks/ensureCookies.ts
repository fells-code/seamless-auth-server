import type { FastifyReply, FastifyRequest } from "fastify";
import {
  applyCookies,
  assertSecrets,
  ensureCookies,
  SERVICE_TOKEN_AUDIENCE,
  SERVICE_TOKEN_ISSUER,
} from "@seamless-auth/core";

import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { fastifyResponseAdapter } from "../internal/respond";
import type { ResolvedOptions } from "../options";

/**
 * Verifies the session cookies on every request into the plugin, refreshing them
 * when the access cookie has expired but the refresh cookie is still good.
 *
 * Runs as `onRequest` so a refused request never reaches a route, and so the
 * refreshed payload is on the request before any handler reads it.
 */
/**
 * `ensureCookies` matches the request path against its own route table, and
 * those entries are mount-relative. Express hands a mounted router a `req.path`
 * that already has the mount point stripped; Fastify's `req.url` keeps the
 * prefix, so it has to come off here or nothing matches and every route silently
 * loses its cookie payload.
 */
function mountRelativePath(url: string, prefix: string): string {
  const path = url.split("?")[0];

  if (!prefix || prefix === "/") {
    return path;
  }

  return path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path;
}

export function createEnsureCookiesHook(opts: ResolvedOptions, prefix: string) {
  assertSecrets(opts);

  return async function ensureCookiesHook(
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const result = await ensureCookies(
      {
        path: mountRelativePath(req.url, prefix),
        cookies: req.cookies ?? {},
      },
      {
        authServerUrl: opts.authServerUrl,
        cookieDomain: opts.cookieDomain,
        accessCookieName: opts.accessCookieName,
        registrationCookieName: opts.registrationCookieName,
        refreshCookieName: opts.refreshCookieName,
        preAuthCookieName: opts.preAuthCookieName,
        cookieSecret: opts.cookieSecret,
        serviceSecret: opts.serviceSecret,
        // The silent-refresh path mints an M2M service token, which the auth API
        // validates against a fixed issuer and audience rather than the
        // adopter-configured one.
        issuer: SERVICE_TOKEN_ISSUER,
        audience: SERVICE_TOKEN_AUDIENCE,
        keyId: opts.jwksKid,
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      },
    );

    applyCookies(result, fastifyResponseAdapter(reply), opts);

    if (result.user) {
      req.cookiePayload = result.user;
    }

    if (result.type === "error") {
      return reply
        .status(result.status ?? 401)
        .send({ error: result.errorCode });
    }
  };
}
