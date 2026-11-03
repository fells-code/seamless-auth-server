import type { AuthServerIssuerOption } from "../authServerIssuer.js";
import { extractBearerToken } from "../verifyAccessToken.js";
import {
  refreshBearerSession,
  refreshCookieSession,
} from "../refreshAccessToken.js";
import { UPSTREAM_UNAVAILABLE_ERROR_CODE } from "../authFetch.js";
import { readPassthroughFailure } from "../upstreamError.js";
import { SERVICE_TOKEN_AUDIENCE, SERVICE_TOKEN_ISSUER } from "../apiContract.js";
import { sessionResult, type UpstreamSessionResponse } from "../upstreamSession.js";
import type { AuthTransport } from "../transport.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface RefreshInput {
  transport: AuthTransport;
  /** The raw `Authorization` header. Bearer transport carries the refresh token here. */
  authorization?: string;
  /** The signed refresh cookie. Cookie transport carries the refresh token here. */
  refreshCookie?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

export interface RefreshOptions extends AuthServerIssuerOption {
  authServerUrl: string;
  audience: string;
  cookieSecret: string;
  serviceSecret: string;
  keyId: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
}

export interface RefreshResult extends ResultFailure {
  status: number;
  body?: unknown;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
  clearCookies?: string[];
}

/**
 * Rotates the session on request.
 *
 * Cookie clients rarely need this, since `ensureCookies` refreshes silently on
 * the auth routes, but it gives them an explicit way to do it. Bearer clients
 * depend on it: nothing refreshes for them, so when the access token expires
 * they present the refresh token here and store the pair that comes back.
 */
export async function refreshHandler(
  input: RefreshInput,
  opts: RefreshOptions,
): Promise<RefreshResult> {
  const forwarding = {
    forwardedClientIp: input.forwardedClientIp,
    forwardedUserAgent: input.forwardedUserAgent,
  };

  const session = {
    authServerUrl: opts.authServerUrl,
    authServerIssuer: opts.authServerIssuer,
    audience: opts.audience,
    accessCookieName: opts.accessCookieName,
    refreshCookieName: opts.refreshCookieName,
    cookieDomain: opts.cookieDomain,
    transport: input.transport,
  };

  if (input.transport === "bearer") {
    const refreshToken = extractBearerToken(input.authorization);

    if (!refreshToken) {
      return { status: 401, errorCode: "refresh token required" };
    }

    const rotated = await refreshBearerSession(refreshToken, {
      authServerUrl: opts.authServerUrl,
      serviceAuthorization: input.serviceAuthorization,
      ...forwarding,
    });

    if (rotated.status !== 200) {
      return { status: rotated.status, errorBody: rotated.body };
    }

    return {
      status: 200,
      ...(await sessionResult(rotated.body as UpstreamSessionResponse, session)),
    };
  }

  if (!input.refreshCookie) {
    return { status: 401, errorCode: "refresh token required" };
  }

  const rotated = await refreshCookieSession(input.refreshCookie, {
    authServerUrl: opts.authServerUrl,
    cookieSecret: opts.cookieSecret,
    serviceSecret: opts.serviceSecret,
    // The refresh path mints an M2M service token, which the auth API validates
    // against a fixed issuer and audience rather than the adopter-configured one.
    issuer: SERVICE_TOKEN_ISSUER,
    audience: SERVICE_TOKEN_AUDIENCE,
    keyId: opts.keyId,
    ...forwarding,
  });

  if (rotated.type === "rejected") {
    return {
      status: 401,
      errorCode: "invalid_refresh_token",
      clearCookies: [opts.accessCookieName, opts.refreshCookieName],
    };
  }

  // Short of a refusal the token may still be good, or rotated with the answer
  // lost, so the cookies stay for the next attempt.
  if (rotated.type === "answered") {
    return { status: rotated.status, ...readPassthroughFailure(rotated.body) };
  }

  if (rotated.type === "unavailable") {
    return { status: 502, errorCode: UPSTREAM_UNAVAILABLE_ERROR_CODE };
  }

  try {
    return {
      status: 200,
      ...(await sessionResult(rotated.session as UpstreamSessionResponse, session)),
    };
  } catch {
    return { status: 502, errorCode: UPSTREAM_UNAVAILABLE_ERROR_CODE };
  }
}
