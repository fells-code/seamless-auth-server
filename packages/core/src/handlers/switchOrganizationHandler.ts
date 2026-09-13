import { authFetch } from "../authFetch.js";
import { sessionResult } from "../upstreamSession.js";
import type { AuthTransport } from "../transport.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface SwitchOrganizationInput {
  organizationId: string;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

export interface SwitchOrganizationOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
  transport?: AuthTransport;
}

export interface SwitchOrganizationResult extends ResultFailure {
  status: number;
  body?: unknown;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function switchOrganizationHandler(
  input: SwitchOrganizationInput,
  opts: SwitchOrganizationOptions,
): Promise<SwitchOrganizationResult> {
  const up = await authFetch(
    `${opts.authServerUrl}/organizations/${encodeURIComponent(input.organizationId)}/switch`,
    {
      method: "POST",
      authorization: input.authorization,
      serviceAuthorization: input.serviceAuthorization,
      forwardedClientIp: input.forwardedClientIp,
      forwardedUserAgent: input.forwardedUserAgent,
    },
  );

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readPassthroughFailure(data),
    };
  }

  if (!data?.token || !data?.sub) {
    return {
      status: up.status,
      body: data,
    };
  }

  return {
    status: up.status,
    ...(await sessionResult(data, {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      accessCookieName: opts.accessCookieName,
      cookieDomain: opts.cookieDomain,
      transport: opts.transport,
    })),
  };
}
