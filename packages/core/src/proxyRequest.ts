import type { AppliableResult } from "./applyResult.js";
import { authFetch, type AuthFetchOptions } from "./authFetch.js";

/**
 * Query parameters to forward upstream.
 *
 * Values are deliberately `unknown`: adapters hand over whatever their
 * framework parsed, and Express's `ParsedQs` can nest objects. Scalars and
 * arrays of scalars are forwarded, everything else is dropped, so a nested
 * object cannot reach the auth API as `[object Object]`.
 */
export type QueryInput = Record<string, unknown>;

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/**
 * Builds a querystring for an upstream call.
 *
 * An array becomes repeated parameters (`?type=login&type=logout`), which is
 * what the auth API's schemas accept. Joining them into one comma-separated
 * value produces a parameter that matches nothing upstream.
 */
export function buildQueryString(query?: QueryInput): string {
  if (!query) return "";

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isScalar(item)) params.append(key, String(item));
      }
      continue;
    }

    if (isScalar(value)) params.append(key, String(value));
  }

  return params.toString();
}

export function buildUpstreamUrl(
  authServerUrl: string,
  path: string,
  query?: QueryInput,
): string {
  const base = `${authServerUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const qs = buildQueryString(query);

  return qs ? `${base}?${qs}` : base;
}

export type ProxyIdentity = "preAuth" | "access" | "register";

export interface ProxyIdentityInput {
  /** `sub` from the verified cookie payload, if the request carried one. */
  subject?: string;
  cookies: Record<string, unknown>;
  identity: ProxyIdentity;
  accessCookieName: string;
  preAuthCookieName: string;
  registrationCookieName: string;
}

export interface ProxyIdentityRejection {
  status: number;
  errorCode: string;
  /** Set when the caller should log the rejection rather than only return it. */
  warn?: string;
}

/**
 * Checks that a request carries the session a proxied route requires.
 *
 * Returns the rejection to send, or `undefined` when the request may proceed.
 * The cookie payload alone is not enough: it survives a refresh, so the route
 * also has to see the specific cookie for the identity it needs.
 */
export function checkProxyIdentity(
  input: ProxyIdentityInput,
): ProxyIdentityRejection | undefined {
  if (!input.subject) {
    return {
      status: 401,
      errorCode: "Unauthenticated request",
      warn: "Missing expected cookie payload/sub.",
    };
  }

  const required: Record<ProxyIdentity, { name: string; error: string }> = {
    access: { name: input.accessCookieName, error: "access session required" },
    preAuth: {
      name: input.preAuthCookieName,
      error: "pre-auth session required",
    },
    register: {
      name: input.registrationCookieName,
      error: "registration session required",
    },
  };

  const { name, error } = required[input.identity];

  return input.cookies[name] ? undefined : { status: 401, errorCode: error };
}

export interface ProxyRequestOptions {
  authServerUrl: string;
  path: string;
  method?: AuthFetchOptions["method"];
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  query?: QueryInput;
  body?: unknown;
}

/**
 * Forwards a request to the auth API and returns its status and body unchanged.
 *
 * Transparent on purpose: a proxied route has no view into what the response
 * means, so a failure body is returned as-is rather than reshaped into a code.
 */
export async function proxyRequest(
  opts: ProxyRequestOptions,
): Promise<AppliableResult> {
  const method = opts.method ?? "POST";

  const upstream = await authFetch(
    buildUpstreamUrl(opts.authServerUrl, opts.path, opts.query),
    {
      method,
      authorization: opts.authorization,
      serviceAuthorization: opts.serviceAuthorization,
      forwardedClientIp: opts.forwardedClientIp,
      ...(method === "GET" ? {} : { body: opts.body }),
    },
  );

  return { status: upstream.status, body: await upstream.json() };
}
