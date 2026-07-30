import { authFetch } from "../authFetch.js";
import { issueSessionCookies } from "../upstreamSession.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface FinishRegisterInput {
  authorization?: string;
  headers?: Record<string, string>;
  body: unknown;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
}

export interface FinishRegisterOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
}

export interface FinishRegisterResult extends ResultFailure {
  status: number;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function finishRegisterHandler(
  input: FinishRegisterInput,
  opts: FinishRegisterOptions,
): Promise<FinishRegisterResult> {
  const up = await authFetch(`${opts.authServerUrl}/webAuthn/register/finish`, {
    method: "POST",
    authorization: input.authorization,
    headers: input.headers,
    body: input.body,
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
    status: 204,
    setCookies: await issueSessionCookies(data, {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      accessCookieName: opts.accessCookieName,
      refreshCookieName: opts.refreshCookieName,
      cookieDomain: opts.cookieDomain,
    }),
  };
}
