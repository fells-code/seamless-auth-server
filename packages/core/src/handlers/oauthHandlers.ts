import { authFetch } from "../authFetch.js";
import { issueSessionCookies } from "../upstreamSession.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface OAuthHandlerOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
}

export interface OAuthRequestInput {
  providerId?: string;
  body?: unknown;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
}

export interface OAuthHandlerResult extends ResultFailure {
  status: number;
  body?: unknown;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function listOAuthProvidersHandler(
  opts: Pick<OAuthHandlerOptions, "authServerUrl">,
) {
  const up = await authFetch(`${opts.authServerUrl}/oauth/providers`, {
    method: "GET",
  });

  const data = await up.json();

  return {
    status: up.status,
    ...(up.ok ? { body: data } : readPassthroughFailure(data)),
  };
}

export async function startOAuthLoginHandler(
  input: OAuthRequestInput,
  opts: Pick<OAuthHandlerOptions, "authServerUrl">,
) {
  const up = await authFetch(
    `${opts.authServerUrl}/oauth/${encodeURIComponent(input.providerId!)}/start`,
    {
      method: "POST",
      body: input.body,
      serviceAuthorization: input.serviceAuthorization,
      forwardedClientIp: input.forwardedClientIp,
    },
  );

  const data = await up.json();

  return {
    status: up.status,
    ...(up.ok ? { body: data } : readPassthroughFailure(data)),
  };
}

export async function finishOAuthLoginHandler(
  input: OAuthRequestInput,
  opts: OAuthHandlerOptions,
): Promise<OAuthHandlerResult> {
  const up = await authFetch(
    `${opts.authServerUrl}/oauth/${encodeURIComponent(input.providerId!)}/callback`,
    {
      method: "POST",
      body: input.body,
      serviceAuthorization: input.serviceAuthorization,
      forwardedClientIp: input.forwardedClientIp,
    },
  );

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readPassthroughFailure(data),
    };
  }

  return {
    status: up.status,
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
