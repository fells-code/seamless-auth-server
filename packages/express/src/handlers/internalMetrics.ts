import { Request, Response } from "express";
import {
  getAuthEventSummaryHandler,
  getAuthEventTimeseriesHandler,
  getLoginStatsHandler,
  getSecurityAnomaliesHandler,
  getDashboardMetricsHandler,
  getGroupedEventSummaryHandler,
} from "@seamless-auth/core/handlers/internalMetrics";

import { buildServiceAuthorization } from "../internal/buildAuthorization";
import { SeamlessAuthServerOptions } from "../createServer";

function handle(res: Response, result: any) {
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json(result.body);
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
    query: req.query as any,
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
    query: req.query as any,
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
  });

  return handle(res, result);
}
