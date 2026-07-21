import { Request, Response } from "express";
import {
  getAuthEventSummaryHandler,
  getAuthEventTimeseriesHandler,
  getLoginStatsHandler,
  getSecurityAnomaliesHandler,
  getDashboardMetricsHandler,
  getGroupedEventSummaryHandler,
} from "@seamless-auth/core/handlers/internalMetrics";

import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";

function handle(res: Response, result: any) {
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json(result.body);
}

// Express types req.query as ParsedQs, whose values may be arrays or nested
// objects. The metrics handlers only forward scalar query params, so reduce to
// the first string value per key instead of casting the whole object.
function toQueryRecord(
  query: Request["query"],
): Record<string, string | undefined> {
  const record: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      record[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      record[key] = value[0];
    }
  }
  return record;
}

export async function getAuthEventSummary(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await getAuthEventSummaryHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    query: toQueryRecord(req.query),
  });

  return handle(res, result);
}

export async function getAuthEventTimeseries(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await getAuthEventTimeseriesHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    query: toQueryRecord(req.query),
  });

  return handle(res, result);
}

export async function getLoginStats(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await getLoginStatsHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  return handle(res, result);
}

export async function getSecurityAnomalies(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await getSecurityAnomaliesHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  return handle(res, result);
}

export async function getDashboardMetrics(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await getDashboardMetricsHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  return handle(res, result);
}

export async function getGroupedEventSummary(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  const result = await getGroupedEventSummaryHandler({
    authServerUrl: opts.authServerUrl,
    authorization,
    serviceAuthorization: buildProxyServiceAuthorization(opts),
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    query: toQueryRecord(req.query),
  });

  return handle(res, result);
}
