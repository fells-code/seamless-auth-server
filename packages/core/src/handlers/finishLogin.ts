import { authFetch } from "../authFetch.js";
import type { CookiePayload } from "../ensureCookies.js";
import { verifySignedAuthResponse } from "../verifySignedAuthResponse.js";

export interface FinishLoginInput {
  body: unknown;
  authorization?: string;
}

export interface FinishLoginOptions {
  authServerUrl: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
}

export interface FinishLoginResult {
  status: number;
  body?: unknown;
  error?: string;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function finishLoginHandler(
  input: FinishLoginInput,
  opts: FinishLoginOptions,
): Promise<FinishLoginResult> {
  const up = await authFetch(`${opts.authServerUrl}/webAuthn/login/finish`, {
    method: "POST",
    body: input.body,
    authorization: input.authorization,
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

  return {
    status: 200,
    body: data,
    setCookies: [
      {
        name: opts.accessCookieName,
        value: {
          sub: data.sub,
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
