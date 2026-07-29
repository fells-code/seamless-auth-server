import { authFetch } from "../authFetch.js";
import type { ResultFailure } from "../result.js";
import { readUpstreamFailure } from "../upstreamError.js";

type BaseOpts = {
  authServerUrl: string;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
};

type Result = ResultFailure & {
  status: number;
  body?: any;
};

async function request(
  method: "GET" | "DELETE",
  path: string,
  opts: BaseOpts,
): Promise<Result> {
  const up = await authFetch(`${opts.authServerUrl}${path}`, {
    method,
    authorization: opts.authorization,
    serviceAuthorization: opts.serviceAuthorization,
    forwardedClientIp: opts.forwardedClientIp,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readUpstreamFailure(data, "session_request_failed"),
    };
  }

  return {
    status: up.status,
    body: data,
  };
}

export const listSessionsHandler = (opts: BaseOpts) =>
  request("GET", "/sessions", opts);

export const revokeSessionHandler = (id: string, opts: BaseOpts) =>
  request("DELETE", `/sessions/${encodeURIComponent(id)}`, opts);

export const revokeAllSessionsHandler = (opts: BaseOpts) =>
  request("DELETE", "/sessions", opts);
