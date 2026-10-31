import { decodeJwt } from "jose";

import type { SessionCookie } from "./applyResult.js";
import type {
  CookieInstruction,
  EnsureCookiesOptions,
} from "./ensureCookies.js";
import { getSeamlessLogger } from "./logger.js";
import {
  refreshAccessToken,
  refreshSessionToken,
} from "./refreshAccessToken.js";
import {
  issueSessionCookies,
  type UpstreamSessionResponse,
} from "./upstreamSession.js";

function isRecoverySessionToken(token: string | undefined): boolean {
  if (!token) return false;

  try {
    return decodeJwt(token).recovery === true;
  } catch {
    return false;
  }
}

const ENROLLMENT_ROUTES = new Set([
  "POST /webauthn/register/finish",
  "POST /totp/enroll/verify",
]);

export interface RecoveryEnrollmentInput {
  method: string;
  /** The path relative to the adapter's mount point. */
  path: string;
  /** The status the enrollment route is about to answer with. */
  status: number;
  /** The access token the enrollment ran with. */
  accessToken?: string;
  /** Cookies `ensureCookies` queued earlier in this request, if it refreshed. */
  queuedCookies?: CookieInstruction[];
  /** The signed refresh cookie the request arrived with. */
  refreshCookie?: string;
}

/**
 * Rotates a recovery session right after it enrolls a passkey or an authenticator
 * app, so the new access cookie drops the `recovery` claim at once and
 * `requireAuth` stops answering `enrollment_required` (#235).
 *
 * Uses the refresh token a silent refresh queued earlier in this request when
 * there is one: the cookie the request arrived with was rotated by that refresh,
 * and the auth API treats a replay as theft and revokes the whole chain.
 *
 * Answers `undefined` when there is nothing to do or the refresh fails, which
 * leaves the enrollment's own answer unchanged. The caller then refreshes on its
 * next request as before.
 */
export async function refreshAfterRecoveryEnrollment(
  input: RecoveryEnrollmentInput,
  opts: EnsureCookiesOptions,
): Promise<SessionCookie[] | undefined> {
  if (
    input.status < 200 ||
    input.status >= 300 ||
    !ENROLLMENT_ROUTES.has(`${input.method.toUpperCase()} ${input.path.toLowerCase()}`) ||
    !isRecoverySessionToken(input.accessToken)
  ) {
    return undefined;
  }

  const refreshOptions = {
    authServerUrl: opts.authServerUrl,
    cookieSecret: opts.cookieSecret,
    serviceSecret: opts.serviceSecret,
    issuer: opts.issuer,
    audience: opts.audience,
    keyId: opts.keyId,
    forwardedClientIp: opts.forwardedClientIp,
    forwardedUserAgent: opts.forwardedUserAgent,
  };

  const queued = input.queuedCookies?.find(
    (cookie) => cookie.name === opts.refreshCookieName,
  )?.value;

  try {
    const refreshed = queued?.refreshToken
      ? await refreshSessionToken(
          { sub: queued.sub, refreshToken: queued.refreshToken },
          refreshOptions,
        )
      : input.refreshCookie
        ? await refreshAccessToken(input.refreshCookie, refreshOptions)
        : null;

    if (!refreshed?.token) {
      throw new Error("the auth API did not rotate the session");
    }

    return await issueSessionCookies(refreshed as UpstreamSessionResponse, {
      authServerUrl: opts.authServerUrl,
      audience: opts.accessTokenAudience || opts.authServerUrl,
      authServerIssuer: opts.authServerIssuer,
      accessCookieName: opts.accessCookieName,
      refreshCookieName: opts.refreshCookieName,
      cookieDomain: opts.cookieDomain,
    });
  } catch (error) {
    getSeamlessLogger().warn(
      `[SeamlessAuth] Could not refresh a recovery session after enrollment: ${
        error instanceof Error ? error.message : "unknown error"
      }.`,
    );
    return undefined;
  }
}
