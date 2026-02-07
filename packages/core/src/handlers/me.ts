import { authFetch } from "../authFetch.js";

export interface MeOptions {
  authServerUrl: string;
  preAuthCookieName: string;
  authorization?: string;
}

export interface MeResult {
  status: number;
  body?: {
    user: unknown;
    credentials?: unknown;
  };
  error?: string;
  clearCookies?: string[];
}

export async function meHandler(opts: MeOptions): Promise<MeResult> {
  const up = await authFetch(`${opts.authServerUrl}/users/me`, {
    method: "GET",
    authorization: opts.authorization,
  });

  const data = await up.json();
  const clearCookies = [opts.preAuthCookieName];

  if (!data?.user) {
    return {
      status: 401,
      error: "unauthenticated",
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
