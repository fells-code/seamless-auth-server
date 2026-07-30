import { authFetch } from "../authFetch.js";
import { issueSessionCookies } from "../upstreamSession.js";
import { readPassthroughFailure } from "../upstreamError.js";
import type { ResultFailure } from "../result.js";
import type { CookiePayload } from "../ensureCookies.js";

export interface VerifyLoginOtpInput {
  body: unknown;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  kind: "email" | "phone";
}

export interface VerifyLoginOtpOptions {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
}

export interface VerifyLoginOtpResult extends ResultFailure {
  status: number;
  body?: unknown;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

// Shared by the login and registration OTP verify handlers: POST to the given
// auth-server path and, when the response carries a session, validate the signed
// access token and build the session cookies. Registration can complete without
// a session yet (e.g. a phone-first step before email is verified), in which case
// there is no token to turn into cookies, so the body is returned as-is.
async function verifyOtp(
  path: string,
  input: VerifyLoginOtpInput,
  opts: VerifyLoginOtpOptions,
): Promise<VerifyLoginOtpResult> {
  const up = await authFetch(`${opts.authServerUrl}/${path}`, {
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

  if (!data?.token) {
    return {
      status: up.status,
      body: data,
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

export async function verifyLoginOtpHandler(
  input: VerifyLoginOtpInput,
  opts: VerifyLoginOtpOptions,
): Promise<VerifyLoginOtpResult> {
  const path =
    input.kind === "email"
      ? "otp/verify-login-email-otp"
      : "otp/verify-login-phone-otp";

  return verifyOtp(path, input, opts);
}

export async function verifyRegistrationOtpHandler(
  input: VerifyLoginOtpInput,
  opts: VerifyLoginOtpOptions,
): Promise<VerifyLoginOtpResult> {
  const path =
    input.kind === "email" ? "otp/verify-email-otp" : "otp/verify-phone-otp";

  return verifyOtp(path, input, opts);
}
