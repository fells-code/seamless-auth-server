import { authFetch } from "../authFetch.js";

export interface LogoutOptions {
  authServerUrl: string;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
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
