import { authFetch } from "../authFetch.js";

export interface LogoutOptions {
  authServerUrl: string;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  authorization?: string;
  forwardedClientIp?: string;
  scope?: LogoutScope;
}

export interface LogoutResult {
  status: number;
  clearCookies: string[];
}

export type LogoutScope = "current_session" | "all_sessions";

function getLogoutPath(scope: LogoutScope) {
  return scope === "all_sessions" ? "/logout/all" : "/logout";
}

export async function logoutHandler(opts: LogoutOptions): Promise<LogoutResult> {
  const scope = opts.scope ?? "all_sessions";
  const upstream = await authFetch(`${opts.authServerUrl}${getLogoutPath(scope)}`, {
    method: "DELETE",
    authorization: opts.authorization,
    forwardedClientIp: opts.forwardedClientIp,
  });

  return {
    status: upstream.ok ? 204 : upstream.status,
    clearCookies: [
      opts.accessCookieName,
      opts.registrationCookieName,
      opts.refreshCookieName,
    ],
  };
}

export function logoutCurrentSessionHandler(opts: Omit<LogoutOptions, "scope">) {
  return logoutHandler({ ...opts, scope: "current_session" });
}

export function logoutAllSessionsHandler(opts: Omit<LogoutOptions, "scope">) {
  return logoutHandler({ ...opts, scope: "all_sessions" });
}
