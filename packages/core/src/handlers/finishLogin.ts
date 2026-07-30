import { authFetch } from "../authFetch.js";
import { issueSessionCookies } from "../upstreamSession.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface FinishLoginInput {
  body: unknown;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
}

export interface FinishLoginOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
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
    setCookies: await issueSessionCookies(data, {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      accessCookieName: opts.accessCookieName,
      refreshCookieName: opts.refreshCookieName,
      cookieDomain: opts.cookieDomain,
    }),
  };
}
