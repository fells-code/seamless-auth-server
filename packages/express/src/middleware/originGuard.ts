import { NextFunction, Request, Response } from "express";

import { CookieSameSite, resolveCookieSameSite } from "../internal/cookie";

export interface OriginGuardOptions {
  cookieSecure?: boolean;
  cookieSameSite?: CookieSameSite;
  allowedOrigins?: string[];
}

// GET/HEAD are read-only and OPTIONS is the CORS preflight, so none can carry a
// state change worth gating.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects cross-site state-changing requests when the adapter issues
 * `SameSite=None` cookies, which the browser would otherwise attach to a forged
 * cross-site request. `Sec-Fetch-Site` is the primary signal: it ships on current
 * browsers and page JavaScript cannot forge it. When it is absent (older
 * browsers) the request `Origin` is matched against `allowedOrigins`, but only
 * when the adopter opted in, so nothing regresses for callers that predate this.
 */
export function createOriginGuardMiddleware(opts: OriginGuardOptions) {
  // A `Lax`/`Strict` cookie is not sent on a cross-site state-changing request,
  // so the guard is inert and only `None` needs gating.
  const active = resolveCookieSameSite(opts) === "none";
  const allowedOrigins = normalizeAllowedOrigins(opts.allowedOrigins);

  return function originGuard(req: Request, res: Response, next: NextFunction) {
    if (!active || SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const secFetchSite = firstHeader(req.headers["sec-fetch-site"]);
    if (secFetchSite !== undefined) {
      if (secFetchSite.toLowerCase() === "cross-site") {
        return reject(res);
      }
      next();
      return;
    }

    const origin = firstHeader(req.headers.origin);
    if (origin === undefined) {
      // No `Origin` and no `Sec-Fetch-Site` is a same-origin or non-browser
      // server-to-server caller. Let it through.
      next();
      return;
    }

    // A literal `null` origin is an opaque or sandboxed origin, which is
    // cross-site regardless of the allowlist.
    if (origin === "null") {
      return reject(res);
    }

    if (allowedOrigins === null) {
      // Older browser, but the adopter has not opted into an allowlist. Preserve
      // the pre-guard behavior rather than start rejecting these.
      next();
      return;
    }

    if (!allowedOrigins.has(normalizeOrigin(origin))) {
      return reject(res);
    }

    next();
  };
}

function reject(res: Response): void {
  res.status(403).json({ error: "cross_site_request_blocked" });
}

function firstHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeOrigin(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeAllowedOrigins(
  origins: string[] | undefined,
): Set<string> | null {
  if (!origins) {
    return null;
  }

  const normalized = new Set<string>();
  for (const origin of origins) {
    const value = normalizeOrigin(origin);
    if (value) {
      normalized.add(value);
    }
  }

  return normalized;
}
