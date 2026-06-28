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
}

export async function authFetch(
  url: string,
  options: AuthFetchOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
    ...(options.authorization ? { Authorization: options.authorization } : {}),
    ...((options.serviceAuthorization ?? options.authorization)
      ? {
          "x-seamless-service-token":
            options.serviceAuthorization ?? options.authorization!,
        }
      : {}),
    ...(options.forwardedClientIp
      ? { "x-seamless-client-ip": options.forwardedClientIp }
      : {}),
  };

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return makeJsonTolerant(response);
}

// Upstream responses aren't always JSON: a rate-limited request comes back as plain
// text ("Too many requests…") and a 204 has no body. Native Response.json() throws on
// both, which would crash callers that parse the body before checking the status. Make
// json() tolerant so callers always get a value — parsed JSON, { message: text } for a
// non-JSON body, or undefined for an empty one.
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
