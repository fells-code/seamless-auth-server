import { authFetch } from "../authFetch.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface RegisterInput {
  body: unknown;
}

export interface RegisterOptions {
  authServerUrl: string;
  cookieDomain?: string;
  registrationCookieName: string;
}

export interface RegisterResult {
  status: number;
  body?: unknown;
  error?: unknown;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function registerHandler(
  input: RegisterInput,
  opts: RegisterOptions,
): Promise<RegisterResult> {
  const up = await authFetch(`${opts.authServerUrl}/registration/register`, {
    method: "POST",
    body: input.body,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data,
    };
  }

  return {
    status: 200,
    body: data,
    setCookies: [
      {
        name: opts.registrationCookieName,
        value: { sub: data.sub },
        ttl: data.ttl,
        domain: opts.cookieDomain,
      },
    ],
  };
}
