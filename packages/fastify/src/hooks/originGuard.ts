import type { FastifyReply, FastifyRequest } from "fastify";
import { checkOrigin, type CookieSameSite } from "@seamless-auth/core";

export interface OriginGuardOptions {
  cookieSecure?: boolean;
  cookieSameSite?: CookieSameSite;
  allowedOrigins?: string[];
}

/**
 * Rejects cross-site state-changing requests when the plugin issues
 * `SameSite=None` cookies. The decision is core's; this reads the headers and
 * writes the response.
 */
export function createOriginGuardHook(opts: OriginGuardOptions) {
  return async function originGuard(req: FastifyRequest, reply: FastifyReply) {
    const rejection = checkOrigin({
      method: req.method,
      secFetchSite: firstHeader(req.headers["sec-fetch-site"]),
      origin: firstHeader(req.headers.origin),
      cookieSecure: opts.cookieSecure,
      cookieSameSite: opts.cookieSameSite,
      allowedOrigins: opts.allowedOrigins,
    });

    if (rejection) {
      return reply
        .status(rejection.status)
        .send({ error: rejection.errorCode });
    }
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
