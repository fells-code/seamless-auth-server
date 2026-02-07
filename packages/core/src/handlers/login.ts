import { authFetch } from "../authFetch.js";
import type { CookiePayload } from "../ensureCookies.js";
import { verifySignedAuthResponse } from "../verifySignedAuthResponse.js";

export interface LoginInput {
  body: unknown;
}

export interface LoginOptions {
  authServerUrl: string;
  cookieDomain?: string;
  preAuthCookieName: string;
}

export interface LoginResult {
  status: number;
  error?: string;
  setCookies?: {
    name: string;
    value: CookiePayload;
    ttl: number;
    domain?: string;
  }[];
}

export async function loginHandler(
  input: LoginInput,
  opts: LoginOptions,
): Promise<LoginResult> {
  const up = await authFetch(`${opts.authServerUrl}/login`, {
    method: "POST",
    body: input.body,
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
        name: opts.preAuthCookieName,
        value: { sub: data.sub, token: data.token },
        ttl: data.ttl,
        domain: opts.cookieDomain,
      },
    ],
  };
}
