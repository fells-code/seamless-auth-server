import { authFetch } from "../authFetch.js";
import { buildUpstreamUrl, type QueryInput } from "../proxyRequest.js";
import type { ResultFailure } from "../result.js";
import { readUpstreamFailure } from "../upstreamError.js";

type BaseOpts = {
  authServerUrl: string;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
};

type WithQuery = BaseOpts & {
  query?: QueryInput;
};

type Result = ResultFailure & {
  status: number;
  body?: any;
};

async function get(path: string, opts: WithQuery): Promise<Result> {
  const up = await authFetch(
    buildUpstreamUrl(opts.authServerUrl, path, opts.query),
    {
      method: "GET",
      authorization: opts.authorization,
      serviceAuthorization: opts.serviceAuthorization,
      forwardedClientIp: opts.forwardedClientIp,
    },
  );

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      ...readUpstreamFailure(data, "internal_request_failed"),
    };
  }

  return {
    status: up.status,
    body: data,
  };
}

export const getAuthEventSummaryHandler = (opts: WithQuery) =>
  get("/internal/auth-events/summary", opts);

export const getAuthEventTimeseriesHandler = (opts: WithQuery) =>
  get("/internal/auth-events/timeseries", opts);

export const getLoginStatsHandler = (opts: BaseOpts) =>
  get("/internal/auth-events/login-stats", opts);

export const getSecurityAnomaliesHandler = (opts: BaseOpts) =>
  get("/internal/security/anomalies", opts);

export const getDashboardMetricsHandler = (opts: BaseOpts) =>
  get("/internal/metrics/dashboard", opts);

export const getGroupedEventSummaryHandler = (opts: WithQuery) =>
  get("/internal/auth-events/grouped", opts);
