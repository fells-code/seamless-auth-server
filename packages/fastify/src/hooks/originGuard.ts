import type { FastifyReply, FastifyRequest } from "fastify";
import {
  AUTH_TRANSPORT_HEADER,
  checkContentType,
  checkOrigin,
} from "@seamless-auth/core";

import { mountRelativePath } from "./ensureCookies.js";

export interface OriginGuardOptions {
  allowedOrigins?: string[];
}

/**
 * Rejects cross-site state-changing requests, and a `POST` a page on another
 * origin could send without a preflight. The decisions are core's; this reads
 * the headers and writes the response. It runs `onRequest`, ahead of Fastify's
 * own body parsing, which accepts `text/plain` and a missing content type.
 */
export function createOriginGuardHook(
  opts: OriginGuardOptions,
  prefix: string,
) {
  return async function originGuard(req: FastifyRequest, reply: FastifyReply) {
    const rejection =
      checkOrigin({
        method: req.method,
        secFetchSite: firstHeader(req.headers["sec-fetch-site"]),
        origin: firstHeader(req.headers.origin),
        allowedOrigins: opts.allowedOrigins,
      }) ??
      checkContentType({
        method: req.method,
        path: mountRelativePath(req.url, prefix),
        contentType: req.headers["content-type"],
        transport: firstHeader(req.headers[AUTH_TRANSPORT_HEADER]),
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
