import { authFetch } from "../authFetch.js";
import type { CookiePayload } from "../ensureCookies.js";
import { verifySignedAuthResponse } from "../verifySignedAuthResponse.js";

export interface FinishRegisterInput {
  authorization?: string;
  body: unknown;
}

export interface FinishRegisterOptions {
  authServerUrl: string;
  cookieDomain?: string;
  accessCookieName: string;
  refreshCookieName: string;
}

export interface FinishRegisterResult {
  status: number;
  error?: unknown;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function finishRegisterHandler(
  input: FinishRegisterInput,
  opts: FinishRegisterOptions,
): Promise<FinishRegisterResult> {
  const up = await authFetch(`${opts.authServerUrl}/webAuthn/register/finish`, {
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

  const verified = await verifySignedAuthResponse(
    data.token,
    opts.authServerUrl,
  );

  if (!verified) {
    throw new Error("Invalid signed response from Auth Server");
  }

  if (verified.sub !== data.sub) {
    throw new Error("Signature mismatch with data payload");
  }

  return {
    status: 204,
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
