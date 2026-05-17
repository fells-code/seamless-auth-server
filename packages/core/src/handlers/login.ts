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
  forwardedClientIp?: string;
}

export interface LoginResult {
  status: number;
  body?: {
    message?: string;
    identifierType?: string;
    loginMethods?: string[];
  };
  error?: unknown;
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
    forwardedClientIp: opts.forwardedClientIp,
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

  const body = {
    ...(typeof data.message === "string" ? { message: data.message } : {}),
    ...(typeof data.identifierType === "string"
      ? { identifierType: data.identifierType }
      : {}),
    ...(Array.isArray(data.loginMethods)
      ? {
          loginMethods: data.loginMethods.filter(
            (item: unknown) => typeof item === "string",
          ),
        }
      : {}),
  };

  return {
    status: up.status,
    body,
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
