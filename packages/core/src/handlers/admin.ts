import { encodePathParam } from "../pathParam.js";
import { authFetch } from "../authFetch.js";
import { buildUpstreamUrl, type QueryInput } from "../proxyRequest.js";
import type { ResultFailure } from "../result.js";
import { readUpstreamFailure } from "../upstreamError.js";

type BaseOpts = {
  authServerUrl: string;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
};

type WithQuery = BaseOpts & {
  query?: QueryInput;
};

type WithBody = BaseOpts & {
  body?: any;
};

type Result = ResultFailure & {
  status: number;
  body?: any;
};

async function request(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: WithQuery & WithBody,
): Promise<Result> {
  const up = await authFetch(
    buildUpstreamUrl(opts.authServerUrl, path, opts.query),
    {
      method,
      authorization: opts.authorization,
      body: opts.body,
      serviceAuthorization: opts.serviceAuthorization,
      forwardedClientIp: opts.forwardedClientIp,
      forwardedUserAgent: opts.forwardedUserAgent,
    },
  );

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readUpstreamFailure(data, "admin_request_failed"),
    };
  }

  return {
    status: up.status,
    body: data,
  };
}

export const getUsersHandler = (opts: WithQuery) =>
  request("GET", "/admin/users", opts);

export const createUserHandler = (opts: WithBody) =>
  request("POST", "/admin/users", opts);

export const deleteUserHandler = (opts: WithBody) =>
  request("DELETE", "/admin/users", opts);

export const updateUserHandler = (userId: string, opts: WithBody) =>
  request("PATCH", `/admin/users/${encodePathParam(userId)}`, opts);

export const getUserDetailHandler = (userId: string, opts: BaseOpts) =>
  request("GET", `/admin/users/${encodePathParam(userId)}`, opts);

export const getUserAnomaliesHandler = (userId: string, opts: BaseOpts) =>
  request("GET", `/admin/users/${encodePathParam(userId)}/anomalies`, opts);

export const getAuthEventsHandler = (opts: WithQuery) =>
  request("GET", "/admin/auth-events", opts);

export const getCredentialCountHandler = (opts: BaseOpts) =>
  request("GET", "/admin/credential-count", opts);

export const listAllSessionsHandler = (opts: WithQuery) =>
  request("GET", "/admin/sessions", opts);

export const listUserSessionsHandler = (userId: string, opts: BaseOpts) =>
  request("GET", `/admin/sessions/${encodePathParam(userId)}`, opts);

export const revokeUserSessionHandler = (id: string, opts: BaseOpts) =>
  request("DELETE", `/admin/sessions/by-id/${encodePathParam(id)}`, opts);

export const revokeAllUserSessionsHandler = (userId: string, opts: BaseOpts) =>
  request(
    "DELETE",
    `/admin/sessions/${encodePathParam(userId)}/revoke-all`,
    opts,
  );

export const recoverUserForDeviceReplacementHandler = (
  userId: string,
  opts: WithBody,
) =>
  request(
    "POST",
    `/admin/users/${encodePathParam(userId)}/recovery/device-replacement`,
    opts,
  );
