import { authFetch } from "../authFetch.js";

type BaseOpts = {
  authServerUrl: string;
  authorization?: string;
};

type WithQuery = BaseOpts & {
  query?: Record<string, any>;
};

type WithBody = BaseOpts & {
  body?: any;
};

type Result = {
  status: number;
  body?: any;
  error?: string;
};

function buildUrl(base: string, query?: Record<string, any>) {
  if (!query) return base;

  const qs = new URLSearchParams(
    Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  ).toString();

  return qs ? `${base}?${qs}` : base;
}

async function request(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: WithQuery & WithBody,
): Promise<Result> {
  const up = await authFetch(
    buildUrl(`${opts.authServerUrl}${path}`, opts.query),
    {
      method,
      authorization: opts.authorization,
      body: opts.body,
    },
  );

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data?.error || "admin_request_failed",
    };
  }

  return {
    status: up.status,
    body: data,
  };
}

export const getUsersHandler = (opts: BaseOpts) =>
  request("GET", "/admin/users", opts);

export const createUserHandler = (opts: WithBody) =>
  request("POST", "/admin/users", opts);

export const deleteUserHandler = (opts: BaseOpts) =>
  request("DELETE", "/admin/users", opts);

export const updateUserHandler = (userId: string, opts: WithBody) =>
  request("PATCH", `/admin/users/${userId}`, opts);

export const getUserDetailHandler = (userId: string, opts: BaseOpts) =>
  request("GET", `/admin/users/${userId}`, opts);

export const getUserAnomaliesHandler = (userId: string, opts: BaseOpts) =>
  request("GET", `/admin/users/${userId}/anomalies`, opts);

export const getAuthEventsHandler = (opts: WithQuery) =>
  request("GET", "/admin/auth-events", opts);

export const getCredentialCountHandler = (opts: BaseOpts) =>
  request("GET", "/admin/credential-count", opts);

export const listAllSessionsHandler = (opts: WithQuery) =>
  request("GET", "/admin/sessions", opts);

export const listUserSessionsHandler = (userId: string, opts: BaseOpts) =>
  request("GET", `/admin/sessions/${userId}`, opts);

export const revokeAllUserSessionsHandler = (userId: string, opts: BaseOpts) =>
  request("DELETE", `/admin/sessions/${userId}/revoke-all`, opts);
