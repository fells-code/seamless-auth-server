import express, { Request, Response, Router } from "express";
import cookieParser from "cookie-parser";

import { createEnsureCookiesMiddleware } from "./middleware/ensureCookies";
import type { CookieSameSite } from "./internal/cookie";
import type { SeamlessAuthMessagingOptions } from "./messaging";

import { login } from "./handlers/login";
import { finishLogin } from "./handlers/finishLogin";
import { register } from "./handlers/register";
import { requestOtp } from "./handlers/requestOtp";
import {
  verifyLoginOtp,
  verifyRegistrationOtp,
} from "./handlers/verifyLoginOtp";
import { switchOrganization } from "./handlers/switchOrganization";
import { finishRegister } from "./handlers/finishRegister";
import { me } from "./handlers/me";
import { logout } from "./handlers/logout";
import { pollMagicLinkConfirmation } from "./handlers/pollMagicLinkConfirmation";
import { requestMagicLink } from "./handlers/requestMagicLink";
import {
  finishOAuthLogin,
  listOAuthProviders,
  startOAuthLogin,
} from "./handlers/oauth";
import * as admin from "./handlers/admin";
import { authFetch, AuthFetchOptions } from "@seamless-auth/core";
import { buildServiceAuthorization } from "./internal/buildAuthorization";
import {
  assertSecrets,
  DEV_JWKS_KID,
  warnOnDevJwksKid,
} from "./internal/validateSecrets";
import { buildForwardedClientIp } from "./internal/buildForwardedClientIp";
import { bootstrapAdminInvite } from "./handlers/bootstrapAdmininvite";
import {
  getAvailableRoles,
  getSystemConfigAdmin,
  updateSystemConfig,
} from "./handlers/systemConfig";
import {
  getAuthEventSummary,
  getAuthEventTimeseries,
  getDashboardMetrics,
  getGroupedEventSummary,
  getLoginStats,
  getSecurityAnomalies,
} from "./handlers/internalMetrics";
import {
  listSessions,
  revokeAllSessions,
  revokeSession,
} from "./handlers/sessions";

type ResolvedSeamlessAuthServerOptions = {
  authServerUrl: string;
  cookieSecret: string;
  serviceSecret: string;
  issuer: string;
  audience: string;
  jwksKid: string;
  cookieDomain: string;
  cookieSecure?: boolean;
  cookieSameSite?: CookieSameSite;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  preAuthCookieName: string;
  messaging?: SeamlessAuthMessagingOptions;
};

export type SeamlessAuthServerOptions = {
  authServerUrl: string;
  cookieSecret: string;
  serviceSecret: string;
  issuer: string;
  audience: string;
  jwksKid?: string;
  cookieDomain?: string;
  cookieSecure?: boolean;
  cookieSameSite?: CookieSameSite;
  accessCookieName?: string;
  registrationCookieName?: string;
  refreshCookieName?: string;
  preAuthCookieName?: string;
  messaging?: SeamlessAuthMessagingOptions;
};

export interface SeamlessAuthUser {
  id: string;
  sub: string;
  roles: string[];
  email: string;
  phone: string;
  iat?: number;
  exp?: number;
  token?: string;
}

function buildProxyQueryString(queryInput: Request["query"]): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(queryInput)) {
    if (typeof value === "string") {
      query.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          query.append(key, item);
        }
      }
    }
  }

  return query.toString();
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Creates an Express Router that proxies all authentication traffic to a Seamless Auth server.
 *
 * This helper wires your API backend to a Seamless Auth instance. It automatically forwards
 * login, registration, WebAuthn, logout, token refresh, and session validation routes to the
 * auth server and handles all cookie management required for a seamless login flow.
 *
 * ### Responsibilities
 * - Proxies all `/auth/*` routes to the upstream Seamless Auth server
 * - Manages `access`, `registration`, `pre-auth`, and `refresh` cookies
 * - Normalizes cookie settings for cross-domain or same-domain deployments
 * - Ensures authentication routes behave consistently across environments
 * - Provides shared middleware for auth flows
 *
 * ### Cookie Types
 * - **accessCookie** – long-lived session cookie for authenticated API requests
 * - **registrationCookie** – ephemeral cookie used during registration and OTP/WebAuthn flows
 * - **preAuthCookie** – short-lived cookie used during login initiation
 * - **refreshCookie** – opaque refresh token cookie used to rotate session tokens
 *
 * All cookie names and their domains may be customized via the `opts` parameter.
 *
 * ### Example
 * ```ts
 * app.use("/auth", createSeamlessAuthServer({
 *   authServerUrl: "https://identifier.seamlessauth.com",
 *   cookieDomain: "mycompany.com",
 *   cookieSecret: process.env.COOKIE_SECRET,
 *   serviceSecret: process.env.SERVICE_SECRET,
 *   jwksKid: "2024-09-main",
 *   accessCookieName: "sa_access",
 *   registrationCookieName: "sa_registration",
 *   refreshCookieName: "sa_refresh",
 * }));
 * ```
 *
 * @param opts - Configuration options for the Seamless Auth proxy:
 *   - `authServerUrl` — Base URL of your Seamless Auth instance (required)
 *   - `cookieSecret` - The value to encode your cookies secrets with (required, at least 32 characters)
 *   - `serviceSecret` - An machine to machine shared secret that matches your auth servers (required, at least 32 characters)
 *   - `jwksKid` - The active jwks KID (defaults to `dev-main` and warns; set it explicitly in production)
 *   - `cookieDomain` — Domain attribute applied to all auth cookies
 *   - `cookieSecure` (defaults to `true`; set `false` only for local HTTP dev)
 *   - `cookieSameSite` (defaults to `none` when secure, `lax` otherwise)
 *   - `accessCookieName` — Name of the session access cookie
 *   - `registrationCookieName` — Name of the ephemeral registration cookie
 *   - `refreshCookieName` — Name of the refresh token cookie
 *   - `preAuthCookieName` — Name of the cookie used during login initiation
 *   - `messaging` — Optional auth-messaging transports, handlers, and overrides
 *
 * @returns An Express `Router` preconfigured with all Seamless Auth routes.
 */
export function createSeamlessAuthServer(
  opts: SeamlessAuthServerOptions,
): Router {
  assertSecrets(opts);
  warnOnDevJwksKid(opts.jwksKid);

  const r = express.Router();

  r.use(express.json());
  r.use(cookieParser());

  const resolvedOpts: ResolvedSeamlessAuthServerOptions = {
    authServerUrl: opts.authServerUrl,
    issuer: opts.issuer,
    audience: opts.audience,
    cookieSecret: opts.cookieSecret,
    serviceSecret: opts.serviceSecret,
    jwksKid: opts.jwksKid ?? DEV_JWKS_KID,
    cookieDomain: opts.cookieDomain ?? "",
    cookieSecure: opts.cookieSecure,
    cookieSameSite: opts.cookieSameSite,
    accessCookieName: opts.accessCookieName ?? "seamless-access",
    registrationCookieName: opts.registrationCookieName ?? "seamless-ephemeral",
    refreshCookieName: opts.refreshCookieName ?? "seamless-refresh",
    preAuthCookieName: opts.preAuthCookieName ?? "seamless-ephemeral",
    messaging: opts.messaging,
  };

  const proxyWithIdentity =
    (
      path: string | ((req: Request) => string),
      identity: "preAuth" | "access" | "register",
      method: AuthFetchOptions["method"] = "POST",
    ) =>
    async (req: Request & { cookiePayload?: any }, res: Response) => {
      if (!req.cookiePayload?.sub) {
        console.warn(
          "[SEAMLESS-AUTH-EXPRESS] - (proxyWithIdentity) - Missing expected cookie payload/sub.",
        );
        res.status(401).json({ error: "Unauthenticated request" });
        return;
      }

      if (
        identity === "access" &&
        !req.cookies[resolvedOpts.accessCookieName]
      ) {
        res.status(401).json({ error: "access session required" });
        return;
      }

      if (
        identity === "preAuth" &&
        !req.cookies[resolvedOpts.preAuthCookieName]
      ) {
        res.status(401).json({ error: "pre-auth session required" });
        return;
      }

      if (
        identity === "register" &&
        !req.cookies[resolvedOpts.registrationCookieName]
      ) {
        res.status(401).json({ error: "registeration session required" });
        return;
      }

      const authorization = buildServiceAuthorization(req, resolvedOpts);
      const forwardedClientIp = buildForwardedClientIp(req);
      const options =
        method == "GET"
          ? { method, authorization, forwardedClientIp }
          : { method, authorization, forwardedClientIp, body: req.body };

      const queryString = buildProxyQueryString(req.query);
      const resolvedPath = typeof path === "function" ? path(req) : path;
      const upstream = await authFetch(
        `${resolvedOpts.authServerUrl}/${resolvedPath}${queryString ? `?${queryString}` : ""}`,
        options as any,
      );

      const data = await upstream.json();
      res.status(upstream.status).json(data);
    };

  r.use(
    createEnsureCookiesMiddleware({
      authServerUrl: resolvedOpts.authServerUrl,
      cookieDomain: resolvedOpts.cookieDomain,
      cookieSecure: resolvedOpts.cookieSecure,
      cookieSameSite: resolvedOpts.cookieSameSite,
      accessCookieName: resolvedOpts.accessCookieName,
      registrationCookieName: resolvedOpts.registrationCookieName,
      refreshCookieName: resolvedOpts.refreshCookieName,
      preAuthCookieName: resolvedOpts.preAuthCookieName,
      cookieSecret: resolvedOpts.cookieSecret,
      serviceSecret: resolvedOpts.serviceSecret,
      // The silent-refresh path mints an M2M service token that the auth API
      // validates with a fixed issuer/audience (see buildInternalServiceAuthorization),
      // not the adopter-configured issuer/audience.
      issuer: "seamless-portal-api",
      audience: "seamless-auth",
      keyId: resolvedOpts.jwksKid,
      forwardedClientIp: undefined,
    } as any),
  );

  r.post(
    "/webAuthn/login/start",
    proxyWithIdentity("webAuthn/login/start", "preAuth"),
  );
  r.post("/webAuthn/login/finish", (req, res) =>
    finishLogin(req, res, resolvedOpts),
  );

  r.get(
    "/webAuthn/register/start",
    proxyWithIdentity("webAuthn/register/start", "preAuth", "GET"),
  );
  r.post("/webAuthn/register/finish", (req, res) =>
    finishRegister(req, res, resolvedOpts),
  );

  r.post("/otp/verify-phone-otp", (req, res) =>
    verifyRegistrationOtp(req, res, resolvedOpts, "phone"),
  );
  r.post("/otp/verify-email-otp", (req, res) =>
    verifyRegistrationOtp(req, res, resolvedOpts, "email"),
  );
  r.post("/otp/verify-login-phone-otp", (req, res) =>
    verifyLoginOtp(req, res, resolvedOpts, "phone"),
  );
  r.post("/otp/verify-login-email-otp", (req, res) =>
    verifyLoginOtp(req, res, resolvedOpts, "email"),
  );

  r.get("/otp/generate-phone-otp", (req, res) =>
    requestOtp(req, res, resolvedOpts, "phone"),
  );
  r.get("/otp/generate-email-otp", (req, res) =>
    requestOtp(req, res, resolvedOpts, "email"),
  );
  r.get("/otp/generate-login-phone-otp", (req, res) =>
    requestOtp(req, res, resolvedOpts, "phone", "login"),
  );
  r.get("/otp/generate-login-email-otp", (req, res) =>
    requestOtp(req, res, resolvedOpts, "email", "login"),
  );

  r.post("/login", (req, res) => login(req, res, resolvedOpts));
  r.get("/oauth/providers", (req, res) =>
    listOAuthProviders(req, res, resolvedOpts),
  );
  r.post("/oauth/:providerId/start", (req, res) =>
    startOAuthLogin(req, res, resolvedOpts),
  );
  r.post("/oauth/:providerId/callback", (req, res) =>
    finishOAuthLogin(req, res, resolvedOpts),
  );
  r.post("/registration/register", (req, res) =>
    register(req, res, resolvedOpts),
  );

  r.get("/users/me", (req, res) => me(req, res, resolvedOpts));
  r.get("/logout", (req, res) =>
    logout(req, res, resolvedOpts, "all_sessions"),
  );
  r.delete("/logout", (req, res) =>
    logout(req, res, resolvedOpts, "current_session"),
  );
  r.delete("/logout/all", (req, res) =>
    logout(req, res, resolvedOpts, "all_sessions"),
  );

  r.get("/organizations", proxyWithIdentity("organizations", "access", "GET"));
  r.post("/organizations", proxyWithIdentity("organizations", "access"));
  r.get(
    "/organizations/:organizationId",
    proxyWithIdentity(
      req => `organizations/${encodeURIComponent(routeParam(req, "organizationId"))}`,
      "access",
      "GET",
    ),
  );
  r.patch(
    "/organizations/:organizationId",
    proxyWithIdentity(
      req => `organizations/${encodeURIComponent(routeParam(req, "organizationId"))}`,
      "access",
      "PATCH",
    ),
  );
  r.post("/organizations/:organizationId/switch", (req, res) =>
    switchOrganization(req, res, resolvedOpts),
  );
  r.get(
    "/organizations/:organizationId/members",
    proxyWithIdentity(
      req => `organizations/${encodeURIComponent(routeParam(req, "organizationId"))}/members`,
      "access",
      "GET",
    ),
  );
  r.post(
    "/organizations/:organizationId/members",
    proxyWithIdentity(
      req => `organizations/${encodeURIComponent(routeParam(req, "organizationId"))}/members`,
      "access",
    ),
  );
  r.patch(
    "/organizations/:organizationId/members/:userId",
    proxyWithIdentity(
      req =>
        `organizations/${encodeURIComponent(routeParam(req, "organizationId"))}/members/${encodeURIComponent(routeParam(req, "userId"))}`,
      "access",
      "PATCH",
    ),
  );
  r.delete(
    "/organizations/:organizationId/members/:userId",
    proxyWithIdentity(
      req =>
        `organizations/${encodeURIComponent(routeParam(req, "organizationId"))}/members/${encodeURIComponent(routeParam(req, "userId"))}`,
      "access",
      "DELETE",
    ),
  );

  r.get(
    "/step-up/status",
    proxyWithIdentity("step-up/status", "access", "GET"),
  );
  r.post(
    "/step-up/webauthn/start",
    proxyWithIdentity("step-up/webauthn/start", "access"),
  );
  r.post(
    "/step-up/webauthn/finish",
    proxyWithIdentity("step-up/webauthn/finish", "access"),
  );
  r.get("/totp/status", proxyWithIdentity("totp/status", "access", "GET"));
  r.post(
    "/totp/enroll/start",
    proxyWithIdentity("totp/enroll/start", "access"),
  );
  r.post(
    "/totp/enroll/verify",
    proxyWithIdentity("totp/enroll/verify", "access"),
  );
  r.post("/totp/disable", proxyWithIdentity("totp/disable", "access"));
  r.post("/totp/verify-mfa", proxyWithIdentity("totp/verify-mfa", "access"));

  r.post("/users/update", proxyWithIdentity("users/update", "access"));
  r.post(
    "/users/credentials",
    proxyWithIdentity("users/credentials", "access"),
  );
  r.delete(
    "/users/credentials",
    proxyWithIdentity("users/credentials", "access", "DELETE"),
  );
  r.get("/magic-link", (req, res) => requestMagicLink(req, res, resolvedOpts));
  r.get("/magic-link/verify/:token", async (req, res) => {
    const upstream = await authFetch(
      `${resolvedOpts.authServerUrl}/magic-link/verify/${encodeURIComponent(routeParam(req, "token"))}`,
      {
        method: "GET",
        forwardedClientIp: buildForwardedClientIp(req),
      } as any,
    );

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  });
  r.get("/magic-link/check", (req, res) =>
    pollMagicLinkConfirmation(req, res, resolvedOpts),
  );
  r.post("/internal/bootstrap/admin-invite", (req, res) =>
    bootstrapAdminInvite(req, res, resolvedOpts),
  );
  r.get("/system-config/roles", (req, res) =>
    getAvailableRoles(req, res, resolvedOpts),
  );

  r.get("/system-config/admin", (req, res) =>
    getSystemConfigAdmin(req, res, resolvedOpts),
  );

  r.patch("/system-config/admin", (req, res) =>
    updateSystemConfig(req, res, resolvedOpts),
  );

  r.get("/internal/auth-events/summary", (req, res) =>
    getAuthEventSummary(req, res, resolvedOpts),
  );

  r.get("/internal/auth-events/timeseries", (req, res) =>
    getAuthEventTimeseries(req, res, resolvedOpts),
  );

  r.get("/internal/auth-events/login-stats", (req, res) =>
    getLoginStats(req, res, resolvedOpts),
  );

  r.get("/internal/security/anomalies", (req, res) =>
    getSecurityAnomalies(req, res, resolvedOpts),
  );

  r.get("/internal/metrics/dashboard", (req, res) =>
    getDashboardMetrics(req, res, resolvedOpts),
  );

  r.get("/internal/auth-events/grouped", (req, res) =>
    getGroupedEventSummary(req, res, resolvedOpts),
  );

  r.get("/admin/users", (req, res) => admin.getUsers(req, res, resolvedOpts));
  r.post("/admin/users", (req, res) =>
    admin.createUser(req, res, resolvedOpts),
  );
  r.delete("/admin/users", (req, res) =>
    admin.deleteUser(req, res, resolvedOpts),
  );
  r.patch("/admin/users/:userId", (req, res) =>
    admin.updateUser(req, res, resolvedOpts),
  );
  r.post("/admin/users/:userId/recovery/device-replacement", (req, res) =>
    admin.recoverUserForDeviceReplacement(req, res, resolvedOpts),
  );
  r.get("/admin/users/:userId", (req, res) =>
    admin.getUserDetail(req, res, resolvedOpts),
  );
  r.get("/admin/users/:userId/anomalies", (req, res) =>
    admin.getUserAnomalies(req, res, resolvedOpts),
  );

  r.get("/admin/auth-events", (req, res) =>
    admin.getAuthEvents(req, res, resolvedOpts),
  );
  r.get("/admin/credential-count", (req, res) =>
    admin.getCredentialCount(req, res, resolvedOpts),
  );

  r.get(
    "/admin/organizations",
    proxyWithIdentity("admin/organizations", "access", "GET"),
  );
  r.post(
    "/admin/organizations",
    proxyWithIdentity("admin/organizations", "access"),
  );
  r.get(
    "/admin/organizations/:organizationId",
    proxyWithIdentity(
      req => `admin/organizations/${encodeURIComponent(routeParam(req, "organizationId"))}`,
      "access",
      "GET",
    ),
  );
  r.patch(
    "/admin/organizations/:organizationId",
    proxyWithIdentity(
      req => `admin/organizations/${encodeURIComponent(routeParam(req, "organizationId"))}`,
      "access",
      "PATCH",
    ),
  );
  r.get(
    "/admin/organizations/:organizationId/members",
    proxyWithIdentity(
      req =>
        `admin/organizations/${encodeURIComponent(routeParam(req, "organizationId"))}/members`,
      "access",
      "GET",
    ),
  );
  r.post(
    "/admin/organizations/:organizationId/members",
    proxyWithIdentity(
      req =>
        `admin/organizations/${encodeURIComponent(routeParam(req, "organizationId"))}/members`,
      "access",
    ),
  );
  r.patch(
    "/admin/organizations/:organizationId/members/:userId",
    proxyWithIdentity(
      req =>
        `admin/organizations/${encodeURIComponent(routeParam(req, "organizationId"))}/members/${encodeURIComponent(routeParam(req, "userId"))}`,
      "access",
      "PATCH",
    ),
  );
  r.delete(
    "/admin/organizations/:organizationId/members/:userId",
    proxyWithIdentity(
      req =>
        `admin/organizations/${encodeURIComponent(routeParam(req, "organizationId"))}/members/${encodeURIComponent(routeParam(req, "userId"))}`,
      "access",
      "DELETE",
    ),
  );

  r.get("/admin/sessions", (req, res) =>
    admin.listAllSessions(req, res, resolvedOpts),
  );
  r.get("/admin/sessions/:userId", (req, res) =>
    admin.listUserSessions(req, res, resolvedOpts),
  );
  r.delete("/admin/sessions/by-id/:id", (req, res) =>
    admin.revokeUserSession(req, res, resolvedOpts),
  );
  r.delete("/admin/sessions/:userId/revoke-all", (req, res) =>
    admin.revokeAllUserSessions(req, res, resolvedOpts),
  );

  r.get("/sessions", (req, res) => listSessions(req, res, resolvedOpts));

  r.delete("/sessions/:id", (req, res) =>
    revokeSession(req, res, resolvedOpts),
  );

  r.delete("/sessions", (req, res) =>
    revokeAllSessions(req, res, resolvedOpts),
  );

  return r;
}
