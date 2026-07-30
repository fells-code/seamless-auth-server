import { authFetch } from "../authFetch.js";
import { readPassthroughFailure } from "../upstreamError.js";
import { EXTERNAL_DELIVERY_HEADERS } from "../apiContract.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface RegisterInput {
  body: unknown;
}

export interface RegisterOptions {
  authServerUrl: string;
  cookieDomain?: string;
  registrationCookieName: string;
  externalDelivery?: boolean;
  forwardedClientIp?: string;
  serviceAuthorization?: string;
}

export interface RegisterResult extends ResultFailure {
  status: number;
  body?: unknown;
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
    forwardedClientIp: opts.forwardedClientIp,
    serviceAuthorization: opts.serviceAuthorization,
    ...(opts.externalDelivery
      ? {
          headers: EXTERNAL_DELIVERY_HEADERS,
        }
      : {}),
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readPassthroughFailure(data),
    };
  }

  return {
    status: 200,
    body: data,
    setCookies: [
      {
        name: opts.registrationCookieName,
        value: { sub: data.sub, token: data.token },
        ttl: data.ttl,
        domain: opts.cookieDomain,
      },
    ],
  };
}
