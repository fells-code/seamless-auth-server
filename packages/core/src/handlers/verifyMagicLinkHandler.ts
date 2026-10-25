import { encodePathParam } from "../pathParam.js";
import { authFetch } from "../authFetch.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { AuthTransport } from "../transport.js";
import { extractBearerToken } from "../verifyAccessToken.js";
import { verifyCookieJwt } from "../verifyCookieJwt.js";

export interface VerifyMagicLinkInput {
  token: string;
  /**
   * The pre-auth credential of the browser opening the link, when it has one.
   * The auth API uses it to recognise the device that requested the link. It is
   * optional: a link opened anywhere else carries none and is still answered.
   */
  authorization?: string;
}

export interface VerifyMagicLinkOptions {
  authServerUrl: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

export interface VerifyMagicLinkResult extends ResultFailure {
  status: number;
  body?: unknown;
}

export interface MagicLinkVerifyAuthorizationInput {
  transport?: AuthTransport;
  /** The raw `Authorization` header, read in bearer transport. */
  authorizationHeader?: string;
  /** The signed pre-auth cookie, read in cookie transport. */
  preAuthCookie?: string;
  cookieSecret: string;
}

/**
 * The `Authorization` to send with a magic link verify, or `undefined`.
 *
 * `ensureCookies` leaves this route ungated, so nothing has decoded the pre-auth
 * cookie by the time it runs. A missing, stale or forged cookie yields no
 * credential rather than a rejection, because the link itself is what
 * authenticates the request.
 */
export function magicLinkVerifyAuthorization(
  input: MagicLinkVerifyAuthorizationInput,
): string | undefined {
  if (input.transport === "bearer") {
    const token = extractBearerToken(input.authorizationHeader);
    return token ? `Bearer ${token}` : undefined;
  }

  if (!input.preAuthCookie) {
    return undefined;
  }

  const payload = verifyCookieJwt(input.preAuthCookie, input.cookieSecret);

  return typeof payload?.token === "string"
    ? `Bearer ${payload.token}`
    : undefined;
}

export async function verifyMagicLinkHandler(
  input: VerifyMagicLinkInput,
  opts: VerifyMagicLinkOptions,
): Promise<VerifyMagicLinkResult> {
  const up = await authFetch(
    `${opts.authServerUrl}/magic-link/verify/${encodePathParam(input.token)}`,
    {
      method: "GET",
      authorization: input.authorization,
      serviceAuthorization: opts.serviceAuthorization,
      forwardedClientIp: opts.forwardedClientIp,
      forwardedUserAgent: opts.forwardedUserAgent,
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
  };
}
