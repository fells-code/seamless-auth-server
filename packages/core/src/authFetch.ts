/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the GNU Affero General Public License v3.0
 */
export interface AuthFetchOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

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

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return makeJsonTolerant(response);
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
