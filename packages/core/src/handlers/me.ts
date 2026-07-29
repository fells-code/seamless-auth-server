import { authFetch } from "../authFetch.js";
import type { ResultFailure } from "../result.js";

export interface MeOptions {
  authServerUrl: string;
  preAuthCookieName: string;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
}

export interface MeResult extends ResultFailure {
  status: number;
  body?: {
    user: unknown;
    credentials?: unknown;
  };
  clearCookies?: string[];
}

export async function meHandler(opts: MeOptions): Promise<MeResult> {
  const up = await authFetch(`${opts.authServerUrl}/users/me`, {
    method: "GET",
    authorization: opts.authorization,
    serviceAuthorization: opts.serviceAuthorization,
    forwardedClientIp: opts.forwardedClientIp,
  });

  const data = await up.json();
  const clearCookies = [opts.preAuthCookieName];

  if (!data?.user) {
    return {
      status: 401,
      errorCode: "unauthenticated",
      clearCookies,
    };
  }

  return {
    status: 200,
    body: {
      user: data.user,
      credentials: data.credentials,
    },
    clearCookies,
  };
}
