import { authFetch } from "../authFetch.js";
import { sessionResult } from "../upstreamSession.js";
import type { AuthTransport } from "../transport.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface PollMagicLinkConfirmationInput {
  authorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

export interface PollMagicLinkConfirmationOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
  serviceAuthorization?: string;
  transport?: AuthTransport;
}

export interface PollMagicLinkConfirmationResult extends ResultFailure {
  status: number;
  body?: unknown;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function pollMagicLinkConfirmationHandler(
  input: PollMagicLinkConfirmationInput,
  opts: PollMagicLinkConfirmationOptions,
): Promise<PollMagicLinkConfirmationResult> {
  const up = await authFetch(`${opts.authServerUrl}/magic-link/check`, {
    method: "GET",
    authorization: input.authorization,
    forwardedClientIp: input.forwardedClientIp,
    forwardedUserAgent: input.forwardedUserAgent,
    serviceAuthorization: opts.serviceAuthorization,
  });

  if (up.status === 204) {
    return {
      status: 204,
    };
  }

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readPassthroughFailure(data),
    };
  }

  if (!data?.token || !data?.refreshToken || !data?.sub) {
    return {
      status: up.status,
      body: data,
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
