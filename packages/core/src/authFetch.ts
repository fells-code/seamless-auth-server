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

  return fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}
