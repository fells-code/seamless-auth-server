import { authFetch } from "../authFetch.js";
import type { CookiePayload } from "../ensureCookies.js";
import { verifySignedAuthResponse } from "../verifySignedAuthResponse.js";

export interface VerifyLoginOtpInput {
  body: unknown;
  authorization?: string;
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

export interface VerifyLoginOtpResult {
  status: number;
  body?: unknown;
  error?: unknown;
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
// there is no token to turn into cookies — the body is returned as-is.
async function verifyOtp(
  path: string,
  input: VerifyLoginOtpInput,
  opts: VerifyLoginOtpOptions,
): Promise<VerifyLoginOtpResult> {
  const up = await authFetch(`${opts.authServerUrl}/${path}`, {
    method: "POST",
    body: input.body,
    authorization: input.authorization,
    forwardedClientIp: input.forwardedClientIp,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data,
    };
  }

  if (!data?.token) {
    return {
      status: up.status,
      body: data,
    };
  }

  const verifiedAccessToken = await verifySignedAuthResponse(
    data.token,
    opts.authServerUrl,
    opts.audience,
  );

  if (!verifiedAccessToken) {
    throw new Error("Invalid signed response from Auth Server");
  }

  if (verifiedAccessToken.sub !== data.sub) {
    throw new Error("Signature mismatch with data payload");
  }

  const sessionId =
    typeof verifiedAccessToken.sid === "string"
      ? verifiedAccessToken.sid
      : undefined;

  return {
    status: up.status,
    body: data,
    setCookies: [
      {
        name: opts.accessCookieName,
        value: {
          sub: data.sub,
          ...(sessionId === undefined ? {} : { sessionId }),
          token: data.token,
          roles: data.roles,
          email: data.email,
          phone: data.phone,
          organizationId: data.organizationId ?? null,
        },
        ttl: data.ttl,
        domain: opts.cookieDomain,
      },
      {
        name: opts.refreshCookieName,
        value: {
          sub: data.sub,
          refreshToken: data.refreshToken,
        },
        ttl: data.refreshTtl,
        domain: opts.cookieDomain,
      },
    ],
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
