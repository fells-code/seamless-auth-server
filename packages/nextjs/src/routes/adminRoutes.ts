import {
  createUserHandler,
  deleteUserHandler,
  getAuthEventSummaryHandler,
  getAuthEventTimeseriesHandler,
  getAuthEventsHandler,
  getAvailableRolesHandler,
  getCredentialCountHandler,
  getDashboardMetricsHandler,
  getFunnelMetricsHandler,
  getGroupedEventSummaryHandler,
  getLoginStatsHandler,
  getSecurityAnomaliesHandler,
  getSignInMetricsHandler,
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
import {
  forwardedClientIp,
  forwardedUserAgent,
  type AuthContext,
} from "../internal/context";
import { param, type Route, type RouteMethod } from "../internal/router";

/** Everything each of these handlers needs to reach the auth API. */
interface CallContext {
  authServerUrl: string;
  authorization?: string;
  serviceAuthorization?: string;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

type Call = (ctx: CallContext, req: AuthContext) => Promise<AppliableResult>;

const TABLE: Array<[RouteMethod, string, Call]> = [
  // Users
  ["GET", "/admin/users", (c, r) => getUsersHandler({ ...c, query: r.query })],
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
    (c, r) => getAuthEventsHandler({ ...c, query: r.query }),
  ],
  ["GET", "/admin/credential-count", (c) => getCredentialCountHandler(c)],

  // Admin session management
  [
    "GET",
    "/admin/sessions",
    (c, r) =>
      listAllSessionsHandler({
        ...c,
        query: r.query,
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
        query: r.query,
      }),
  ],
  [
    "GET",
    "/internal/auth-events/timeseries",
    (c, r) =>
      getAuthEventTimeseriesHandler({
        ...c,
        query: r.query,
      }),
  ],
  [
    "GET",
    "/internal/auth-events/login-stats",
    (c, r) => getLoginStatsHandler({ ...c, query: r.query }),
  ],
  [
    "GET",
    "/internal/auth-events/grouped",
    (c, r) =>
      getGroupedEventSummaryHandler({
        ...c,
        query: r.query,
      }),
  ],
  [
    "GET",
    "/internal/security/anomalies",
    (c, r) => getSecurityAnomaliesHandler({ ...c, query: r.query }),
  ],
  [
    "GET",
    "/internal/metrics/dashboard",
    (c, r) => getDashboardMetricsHandler({ ...c, query: r.query }),
  ],
  [
    "GET",
    "/internal/metrics/funnel",
    (c, r) =>
      getFunnelMetricsHandler({
        ...c,
        query: r.query,
      }),
  ],
  [
    "GET",
    "/internal/metrics/sign-ins",
    (c, r) =>
      getSignInMetricsHandler({
        ...c,
        query: r.query,
      }),
  ],

  // System config
  ["GET", "/system-config/roles", (c) => getAvailableRolesHandler(c)],
  ["GET", "/system-config/admin", (c) => getSystemConfigAdminHandler(c)],
  [
    "PATCH",
    "/system-config/admin",
    (c, r) => updateSystemConfigHandler({ ...c, payload: r.body }),
  ],
];

export const ADMIN_ROUTES: Route[] = TABLE.map(([method, path, call]) => ({
  method,
  path,
  run: (ctx, opts) =>
    call(
      {
        authServerUrl: opts.authServerUrl,
        authorization: buildServiceAuthorization(ctx),
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        forwardedClientIp: forwardedClientIp(ctx.request, opts.resolveClientIp),
        forwardedUserAgent: forwardedUserAgent(ctx.request),
      },
      ctx,
    ),
}));
