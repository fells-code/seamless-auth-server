import { authFetch } from "../authFetch.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface RegisterInput {
  body: unknown;
}

export interface RegisterOptions {
  authServerUrl: string;
  cookieDomain?: string;
  registrationCookieName: string;
  externalDelivery?: boolean;
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
    ...(opts.externalDelivery
      ? {
          headers: {
            "x-seamless-auth-delivery-mode": "external",
          },
        }
      : {}),
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data,
    };
  }

  const rawCookies =
    (up.headers as any).getSetCookie?.() ||
    up.headers.get?.("set-cookie")?.split(",") ||
    [];

  let bootstrapCookie;

  for (const cookie of rawCookies) {
    if (cookie.startsWith("seamless_bootstrap_token=")) {
      const value = cookie.split(";")[0].split("=")[1];

      bootstrapCookie = {
        name: "seamless_bootstrap_token",
        value: { sub: value },
        ttl: "900",
        domain: opts.cookieDomain,
      };

      break;
    }
  }

  const setCookies = [
    {
      name: opts.registrationCookieName,
      value: { sub: data.sub },
      ttl: data.ttl,
      domain: opts.cookieDomain,
    },
  ];

  if (bootstrapCookie) {
    setCookies.push(bootstrapCookie);
  }

  return {
    status: 200,
    body: data,
    setCookies,
  };
}
