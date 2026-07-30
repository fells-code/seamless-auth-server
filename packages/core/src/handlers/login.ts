import { authFetch } from "../authFetch.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";
import { verifyUpstreamSession } from "../upstreamSession.js";

export interface LoginInput {
  body: unknown;
}

export interface LoginOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  preAuthCookieName: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
}

export interface LoginResult extends ResultFailure {
  status: number;
  body?: {
    message?: string;
    identifierType?: string;
    loginMethods?: string[];
  };
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function loginHandler(
  input: LoginInput,
  opts: LoginOptions,
): Promise<LoginResult> {
  const up = await authFetch(`${opts.authServerUrl}/login`, {
    method: "POST",
    body: input.body,
    serviceAuthorization: opts.serviceAuthorization,
    forwardedClientIp: opts.forwardedClientIp,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readPassthroughFailure(data),
    };
  }

  // Login issues only the pre-auth cookie, so it verifies the response without
  // building session cookies from it.
  await verifyUpstreamSession(data, opts.authServerUrl, opts.audience);

  const body = {
    ...(typeof data.message === "string" ? { message: data.message } : {}),
    ...(typeof data.identifierType === "string"
      ? { identifierType: data.identifierType }
      : {}),
    ...(Array.isArray(data.loginMethods)
      ? {
          loginMethods: data.loginMethods.filter(
            (item: unknown) => typeof item === "string",
          ),
        }
      : {}),
  };

  return {
    status: up.status,
    body,
    setCookies: [
      {
        name: opts.preAuthCookieName,
        value: { sub: data.sub, token: data.token },
        ttl: data.ttl,
        domain: opts.cookieDomain,
      },
    ],
  };
}
