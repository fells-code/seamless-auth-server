import { authFetch } from "../authFetch.js";
import { sessionResult } from "../upstreamSession.js";
import type { AuthTransport } from "../transport.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface FinishLoginInput {
  body: unknown;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

export interface FinishLoginOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
  transport?: AuthTransport;
}

export interface FinishLoginResult extends ResultFailure {
  status: number;
  body?: unknown;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function finishLoginHandler(
  input: FinishLoginInput,
  opts: FinishLoginOptions,
): Promise<FinishLoginResult> {
  const up = await authFetch(`${opts.authServerUrl}/webAuthn/login/finish`, {
    method: "POST",
    body: input.body,
    authorization: input.authorization,
    serviceAuthorization: input.serviceAuthorization,
    forwardedClientIp: input.forwardedClientIp,
    forwardedUserAgent: input.forwardedUserAgent,
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
    ...(await sessionResult(data, {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      accessCookieName: opts.accessCookieName,
      refreshCookieName: opts.refreshCookieName,
      cookieDomain: opts.cookieDomain,
      transport: opts.transport,
    })),
  };
}
