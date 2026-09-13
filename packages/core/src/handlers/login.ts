import { authFetch } from "../authFetch.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";
import {
  type UpstreamSessionResponse,
  verifyUpstreamSession,
} from "../upstreamSession.js";
import type { AuthTransport } from "../transport.js";

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
  forwardedUserAgent?: string;
  transport?: AuthTransport;
}

export interface LoginStartBody {
  message?: string;
  identifierType?: string;
  loginMethods?: string[];
}

export interface LoginResult extends ResultFailure {
  status: number;
  /**
   * Cookie transport narrows the body to what the browser needs. Bearer
   * transport returns the upstream body whole, ephemeral token included.
   */
  body?: LoginStartBody | UpstreamSessionResponse;
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
    forwardedUserAgent: opts.forwardedUserAgent,
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

  // The ephemeral token is what carries the flow forward, and a bearer client
  // has nowhere to get it from but the body.
  if (opts.transport === "bearer") {
    return { status: up.status, body: data };
  }

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
