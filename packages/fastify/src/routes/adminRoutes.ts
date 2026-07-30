import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createUserHandler,
  deleteUserHandler,
  getAuthEventSummaryHandler,
  getAuthEventTimeseriesHandler,
  getAuthEventsHandler,
  getAvailableRolesHandler,
  getCredentialCountHandler,
  getDashboardMetricsHandler,
  getGroupedEventSummaryHandler,
  getLoginStatsHandler,
  getSecurityAnomaliesHandler,
  getSystemConfigAdminHandler,
  getUserAnomaliesHandler,
  getUserDetailHandler,
  getUsersHandler,
  listAllSessionsHandler,
  listSessionsHandler,
  listUserSessionsHandler,
  recoverUserForDeviceReplacementHandler,
  revokeAllSessionsHandler,
  revokeAllUserSessionsHandler,
  revokeSessionHandler,
  revokeUserSessionHandler,
  updateSystemConfigHandler,
  updateUserHandler,
  type AppliableResult,
} from "@seamless-auth/core";

import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { respond } from "../internal/respond";
import type { ResolvedOptions } from "../options";

/** Everything each of these handlers needs to reach the auth API. */
interface CallContext {
  authServerUrl: string;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
}

type Call = (ctx: CallContext, req: FastifyRequest) => Promise<AppliableResult>;

function param(req: FastifyRequest, name: string): string {
  const value = (req.params as Record<string, unknown>)[name];

  if (typeof value !== "string" || value === "") {
    throw new Error(`Missing route parameter "${name}"`);
  }

  return value;
}

/**
 * The handler-backed routes, as a table.
 *
 * Every one of them is the same shape: build the call context, invoke a core
 * handler, apply the result. Writing that out per route is what makes the
 * equivalent Express file 520 lines.
 */
const ROUTES: Array<["GET" | "POST" | "PATCH" | "DELETE", string, Call]> = [
  // Users
  ["GET", "/admin/users", (c) => getUsersHandler(c)],
  ["POST", "/admin/users", (c, r) => createUserHandler({ ...c, body: r.body })],
  [
    "DELETE",
    "/admin/users",
    (c, r) => deleteUserHandler({ ...c, body: r.body }),
  ],
  [
    "PATCH",
    "/admin/users/:userId",
    (c, r) => updateUserHandler(param(r, "userId"), { ...c, body: r.body }),
  ],
  [
    "GET",
    "/admin/users/:userId",
    (c, r) => getUserDetailHandler(param(r, "userId"), c),
  ],
  [
    "GET",
    "/admin/users/:userId/anomalies",
    (c, r) => getUserAnomaliesHandler(param(r, "userId"), c),
  ],
  [
    "POST",
    "/admin/users/:userId/recovery/device-replacement",
    (c, r) =>
      recoverUserForDeviceReplacementHandler(param(r, "userId"), {
        ...c,
        body: r.body,
      }),
  ],

  // Auth events and credentials
  [
    "GET",
    "/admin/auth-events",
    (c, r) =>
      getAuthEventsHandler({ ...c, query: r.query as Record<string, unknown> }),
  ],
  ["GET", "/admin/credential-count", (c) => getCredentialCountHandler(c)],

  // Admin session management
  [
    "GET",
    "/admin/sessions",
    (c, r) =>
      listAllSessionsHandler({
        ...c,
        query: r.query as Record<string, unknown>,
      }),
  ],
  [
    "GET",
    "/admin/sessions/:userId",
    (c, r) => listUserSessionsHandler(param(r, "userId"), c),
  ],
  [
    "DELETE",
    "/admin/sessions/by-id/:id",
    (c, r) => revokeUserSessionHandler(param(r, "id"), c),
  ],
  [
    "DELETE",
    "/admin/sessions/:userId/revoke-all",
    (c, r) => revokeAllUserSessionsHandler(param(r, "userId"), c),
  ],

  // The caller's own sessions
  ["GET", "/sessions", (c) => listSessionsHandler(c)],
  [
    "DELETE",
    "/sessions/:id",
    (c, r) => revokeSessionHandler(param(r, "id"), c),
  ],
  ["DELETE", "/sessions", (c) => revokeAllSessionsHandler(c)],

  // Internal metrics
  [
    "GET",
    "/internal/auth-events/summary",
    (c, r) =>
      getAuthEventSummaryHandler({
        ...c,
        query: r.query as Record<string, unknown>,
      }),
  ],
  [
    "GET",
    "/internal/auth-events/timeseries",
    (c, r) =>
      getAuthEventTimeseriesHandler({
        ...c,
        query: r.query as Record<string, unknown>,
      }),
  ],
  ["GET", "/internal/auth-events/login-stats", (c) => getLoginStatsHandler(c)],
  [
    "GET",
    "/internal/auth-events/grouped",
    (c, r) =>
      getGroupedEventSummaryHandler({
        ...c,
        query: r.query as Record<string, unknown>,
      }),
  ],
  [
    "GET",
    "/internal/security/anomalies",
    (c) => getSecurityAnomaliesHandler(c),
  ],
  ["GET", "/internal/metrics/dashboard", (c) => getDashboardMetricsHandler(c)],

  // System config
  ["GET", "/system-config/roles", (c) => getAvailableRolesHandler(c)],
  ["GET", "/system-config/admin", (c) => getSystemConfigAdminHandler(c)],
  [
    "PATCH",
    "/system-config/admin",
    (c, r) => updateSystemConfigHandler({ ...c, payload: r.body }),
  ],
];

export function registerAdminRoutes(
  fastify: FastifyInstance,
  opts: ResolvedOptions,
): void {
  for (const [method, path, call] of ROUTES) {
    fastify.route({
      method,
      url: path,
      handler: async (req, reply) => {
        const result = await call(
          {
            authServerUrl: opts.authServerUrl,
            authorization: buildServiceAuthorization(req),
            serviceAuthorization: buildProxyServiceAuthorization(opts),
            forwardedClientIp: buildForwardedClientIp(
              req,
              opts.resolveClientIp,
            ),
          },
          req,
        );

        respond(reply, result, opts);
      },
    });
  }
}
