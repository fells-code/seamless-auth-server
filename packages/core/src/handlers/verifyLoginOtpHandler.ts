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

export async function verifyLoginOtpHandler(
  input: VerifyLoginOtpInput,
  opts: VerifyLoginOtpOptions,
): Promise<VerifyLoginOtpResult> {
  const path =
    input.kind === "email"
      ? "otp/verify-login-email-otp"
      : "otp/verify-login-phone-otp";

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

  const verifiedAccessToken = await verifySignedAuthResponse(
    data.token,
    opts.authServerUrl,
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
          roles: data.roles,
          email: data.email,
          phone: data.phone,
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
