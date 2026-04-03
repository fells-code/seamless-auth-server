import { authFetch } from "../authFetch.js";

type BaseOpts = {
  authServerUrl: string;
  authorization?: string;
};

type WithQuery = BaseOpts & {
  query?: Record<string, string | number | boolean | undefined>;
};

type Result = {
  status: number;
  body?: any;
  error?: string;
};

function buildUrl(base: string, query?: WithQuery["query"]) {
  if (!query) return base;
  const qs = new URLSearchParams(
    Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  ).toString();

  return qs ? `${base}?${qs}` : base;
}

async function get(path: string, opts: WithQuery): Promise<Result> {
  const up = await authFetch(
    buildUrl(`${opts.authServerUrl}${path}`, opts.query),
    {
      method: "GET",
      authorization: opts.authorization,
    },
  );

  const data = await up.json();

  if (!up.ok) {
    return {
      status: up.status,
      error: data?.error || "internal_request_failed",
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

export const getGroupedEventSummaryHandler = (opts: BaseOpts) =>
  get("/internal/auth-events/grouped", opts);
