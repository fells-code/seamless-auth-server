import { authFetch } from "../authFetch.js";

export interface LogoutOptions {
  authServerUrl: string;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  forwardedClientIp?: string;
}

export interface LogoutResult {
  status: number;
  clearCookies: string[];
}

export async function logoutHandler(
  opts: LogoutOptions,
): Promise<LogoutResult> {
  await authFetch(`${opts.authServerUrl}/logout`, {
    method: "GET",
    forwardedClientIp: opts.forwardedClientIp,
  });

  return {
    status: 204,
    clearCookies: [
      opts.accessCookieName,
      opts.registrationCookieName,
      opts.refreshCookieName,
    ],
  };
}
