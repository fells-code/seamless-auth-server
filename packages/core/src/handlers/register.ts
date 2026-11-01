import type { AuthServerIssuerOption } from "../authServerIssuer.js";
import { authFetch } from "../authFetch.js";
import { readPassthroughFailure } from "../upstreamError.js";
import { EXTERNAL_DELIVERY_HEADERS } from "../apiContract.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";
import { verifyUpstreamSession } from "../upstreamSession.js";
import type { AuthTransport } from "../transport.js";
import { withoutTokens } from "../bodyTokens.js";

export interface RegisterInput {
  body: unknown;
}

export interface RegisterOptions extends AuthServerIssuerOption {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  registrationCookieName: string;
  externalDelivery?: boolean;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
  serviceAuthorization?: string;
  transport?: AuthTransport;
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

/** The error code a registration gets when the auth API's token fails verification. */
export const INVALID_UPSTREAM_SESSION_ERROR_CODE = "invalid_upstream_session";

export async function registerHandler(
  input: RegisterInput,
  opts: RegisterOptions,
): Promise<RegisterResult> {
  const up = await authFetch(`${opts.authServerUrl}/registration/register`, {
    method: "POST",
    body: input.body,
    forwardedClientIp: opts.forwardedClientIp,
    forwardedUserAgent: opts.forwardedUserAgent,
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

  try {
    await verifyUpstreamSession(
      data,
      opts.authServerUrl,
      opts.audience,
      opts.authServerIssuer,
      "ephemeral",
    );
  } catch {
    return { status: 502, errorCode: INVALID_UPSTREAM_SESSION_ERROR_CODE };
  }

  if (opts.transport === "bearer") {
    return { status: 200, body: data };
  }

  return {
    status: 200,
    body: withoutTokens(data),
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
