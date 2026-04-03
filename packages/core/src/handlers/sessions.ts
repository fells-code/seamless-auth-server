import { authFetch } from "../authFetch.js";

type BaseOpts = {
  authServerUrl: string;
  authorization?: string;
};

type Result = {
  status: number;
  body?: any;
  error?: string;
};

async function request(
  method: "GET" | "DELETE",
  path: string,
  opts: BaseOpts,
): Promise<Result> {
  const up = await authFetch(`${opts.authServerUrl}${path}`, {
    method,
    authorization: opts.authorization,
  });

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data?.error || "session_request_failed",
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
  request("DELETE", `/sessions/${id}`, opts);

export const revokeAllSessionsHandler = (opts: BaseOpts) =>
  request("DELETE", "/sessions", opts);
