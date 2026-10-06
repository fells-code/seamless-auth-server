import { isIP } from "node:net";

import { parse as parseCookieHeader } from "cookie";
import {
  AUTH_TRANSPORT_HEADER,
  resolveAuthTransport,
  type AuthTransport,
} from "@seamless-auth/core";

import type { ClientIpResolver } from "../options";

/**
 * What a route reads from a request. The Express and Fastify adapters get this
 * from their framework; a route handler only has a `Request`, so it is built
 * here once per request.
 */
export interface AuthContext {
  request: Request;
  method: string;
  /** Relative to the mount point, matching the paths in the route tables. */
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
  cookies: Record<string, string | undefined>;
  transport: AuthTransport;
  /** Set once `ensureCookies` has verified the session cookie. */
  cookiePayload?: { sub: string; token?: string; [key: string]: unknown };
}

// The same cap Express's json() applies, so both adapters refuse the same body.
export const MAX_BODY_BYTES = 100 * 1024;

export class BodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super(status === 413 ? "payload_too_large" : "bad_request");
  }
}

export function mountRelativePath(pathname: string, basePath: string): string {
  const base = basePath.replace(/\/+$/, "");

  if (!base) {
    return pathname;
  }

  if (pathname === base) {
    return "/";
  }

  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

export function readCookies(request: Request): Record<string, string | undefined> {
  const header = request.headers.get("cookie");
  return header ? parseCookieHeader(header) : {};
}

export function readQuery(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};

  for (const [key, value] of url.searchParams) {
    const existing = query[key];
    query[key] =
      existing === undefined
        ? value
        : Array.isArray(existing)
          ? [...existing, value]
          : [existing, value];
  }

  return query;
}

/**
 * Parses a JSON body the way Express's `json()` does: only for
 * `application/json`, `undefined` when there is none, and a client error rather than a crash
 * for a body that is malformed or too large.
 */
export async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!/^application\/json\b/i.test(contentType)) {
    return undefined;
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new BodyError(413);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new BodyError(413);
  }

  if (bytes.byteLength === 0) {
    return undefined;
  }

  const text = new TextDecoder().decode(bytes);

  // Express's json() is strict: only an object or an array is a body.
  if (!/^[\s]*[{[]/.test(text)) {
    throw new BodyError(400);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError(400);
  }
}

export function transportOf(request: Request): AuthTransport {
  return resolveAuthTransport(
    request.headers.get(AUTH_TRANSPORT_HEADER) ?? undefined,
  );
}

// The auth API caps what it records; anything beyond this is not a browser.
const MAX_USER_AGENT_LENGTH = 512;

/**
 * The browser's user agent, for the auth API to record instead of this
 * adapter's own. Self-reported either way, so it needs no trust decision.
 */
export function forwardedUserAgent(request: Request): string | undefined {
  return (
    request.headers
      .get("user-agent")
      ?.trim()
      .slice(0, MAX_USER_AGENT_LENGTH) || undefined
  );
}

export function forwardedClientIp(
  request: Request,
  resolveClientIp?: ClientIpResolver,
): string | undefined {
  const candidate = resolveClientIp?.(request);
  return candidate && isIP(candidate) !== 0 ? candidate : undefined;
}
