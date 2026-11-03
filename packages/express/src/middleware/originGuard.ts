import { NextFunction, Request, Response } from "express";

import {
  AUTH_TRANSPORT_HEADER,
  checkContentType,
  checkOrigin,
} from "@seamless-auth/core";

export interface OriginGuardOptions {
  allowedOrigins?: string[];
}

/**
 * Rejects cross-site state-changing requests, and a `POST` a page on another
 * origin could send without a preflight. The decisions are core's; this reads
 * the headers and writes the response.
 */
export function createOriginGuardMiddleware(opts: OriginGuardOptions) {
  return function originGuard(req: Request, res: Response, next: NextFunction) {
    const rejection =
      checkOrigin({
        method: req.method,
        secFetchSite: firstHeader(req.headers["sec-fetch-site"]),
        origin: firstHeader(req.headers.origin),
        allowedOrigins: opts.allowedOrigins,
      }) ??
      checkContentType({
        method: req.method,
        path: req.path,
        contentType: req.headers["content-type"],
        transport: firstHeader(req.headers[AUTH_TRANSPORT_HEADER]),
      });

    if (rejection) {
      res.status(rejection.status).json({ error: rejection.errorCode });
      return;
    }

    next();
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
