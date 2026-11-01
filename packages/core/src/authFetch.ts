/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 */
import { getSeamlessLogger } from "./logger.js";
import { redactSensitiveText } from "./redaction.js";

export interface AuthFetchOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
  /** Defaults to {@link DEFAULT_UPSTREAM_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** How long a call to the auth API may take before it answers 502, matching the other adapters. */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;

/** The error code a request gets when the auth API could not be reached or timed out. */
export const UPSTREAM_UNAVAILABLE_ERROR_CODE = "upstream_unavailable";

export async function authFetch(
  url: string,
  options: AuthFetchOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
    ...(options.authorization ? { Authorization: options.authorization } : {}),
    ...(options.serviceAuthorization
      ? { "x-seamless-service-token": options.serviceAuthorization }
      : {}),
    ...(options.forwardedClientIp
      ? { "x-seamless-client-ip": options.forwardedClientIp }
      : {}),
    ...(options.forwardedUserAgent
      ? { "x-seamless-client-user-agent": options.forwardedUserAgent }
      : {}),
  };

  // Following a redirect would resend the service token and the forwarded
  // client headers to wherever a misconfigured proxy in front of the API points.
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(
        options.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS,
      ),
    });
  } catch (err) {
    getSeamlessLogger().error(
      `[SeamlessAuth] The auth API at ${originOf(url)} could not be reached for a ${options.method} (${describeFetchError(err)}).`,
    );
    return jsonError(502, UPSTREAM_UNAVAILABLE_ERROR_CODE);
  }

  if (isRedirect(response)) {
    getSeamlessLogger().error(
      `[SeamlessAuth] The auth API at ${originOf(url)} answered a ${options.method} with a redirect (HTTP ${response.status}), which is not followed.`,
    );
    return jsonError(502, UPSTREAM_REDIRECT_ERROR_CODE);
  }

  return makeJsonTolerant(response);
}

function jsonError(status: number, error: string): Response {
  return makeJsonTolerant(
    new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function describeFetchError(err: unknown): string {
  if (err instanceof Error && err.name === "TimeoutError") {
    return "timed out";
  }
  return redactSensitiveText(err instanceof Error ? err.message : String(err));
}

/** The error code a request gets when the auth API answered it with a redirect. */
export const UPSTREAM_REDIRECT_ERROR_CODE = "upstream_redirect";

function isRedirect(response: Response): boolean {
  return (
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400 && response.status !== 304)
  );
}

// The path can carry a credential, such as a magic link token.
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "<invalid url>";
  }
}

// Upstream responses aren't always JSON, and native Response.json() throws on the ones
// that aren't, which would crash the 24 call sites that parse a body before checking
// the status. Make json() tolerant instead: parsed JSON, { message: text } for a
// non-JSON body, or undefined for an empty one.
//
// Two things still reach this. A 204 carries no body, which is what GET
// /magic-link/check answers while a link is unconfirmed. And the auth API sits behind a
// load balancer, so a 502 or a gateway timeout arrives as that proxy's HTML error page
// without the API being involved at all, which no change upstream can prevent.
//
// The rate-limited case this used to name is fixed: a 429 has answered the JSON error
// shape since seamless-auth-api#241. That removed a reason for this shim, not the shim.
function makeJsonTolerant(response: Response): Response {
  if (typeof response.text !== "function") {
    return response;
  }

  const readText = response.text.bind(response);
  response.json = async () => {
    const text = await readText();
    if (!text) {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  };

  return response;
}
