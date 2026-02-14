import express, { Request, Response, Router } from "express";
import cookieParser from "cookie-parser";

import { createEnsureCookiesMiddleware } from "./middleware/ensureCookies";

import { login } from "./handlers/login";
import { finishLogin } from "./handlers/finishLogin";
import { register } from "./handlers/register";
import { finishRegister } from "./handlers/finishRegister";
import { me } from "./handlers/me";
import { logout } from "./handlers/logout";

import {
  authFetch,
  EnsureCookiesOptions,
  AuthFetchOptions,
} from "@seamless-auth/core";
import { buildServiceAuthorization } from "./internal/buildAuthorization";

type ResolvedSeamlessAuthServerOptions = {
  authServerUrl: string;
  cookieSecret: string;
  serviceSecret: string;
  issuer: string;
  jwksKid: string;
  cookieDomain: string;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  preAuthCookieName: string;
};

export type SeamlessAuthServerOptions = {
  authServerUrl: string;
  cookieSecret: string;
  serviceSecret: string;
  issuer: string;
  jwksKid?: string;
  cookieDomain?: string;
  accessCookieName?: string;
  registrationCookieName?: string;
  refreshCookieName?: string;
  preAuthCookieName?: string;
};

export interface SeamlessAuthUser {
  sub: string;
  roles: string[];
  email: string;
  phone: string;
  iat?: number;
  exp?: number;
}
/**
 * Creates an Express Router that proxies all authentication traffic to a Seamless Auth server.
 *
 * This helper wires your API backend to a Seamless Auth instance running in
 * "server mode." It automatically forwards login, registration, WebAuthn,
 * logout, token refresh, and session validation routes to the auth server
 * and handles all cookie management required for a seamless login flow.
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
 *   cookieSecret: "someLongRandomValue"
 *   serviceSecret: "someLongRandomValueToo"
 *   jwksKid: "dev-main"
 *   accessCookieName: "sa_access",
 *   registrationCookieName: "sa_registration",
 *   refreshCookieName: "sa_refresh",
 * }));
 * ```
 *
 * @param opts - Configuration options for the Seamless Auth proxy:
 *   - `authServerUrl` — Base URL of your Seamless Auth instance (required)
 *   - `cookieSecret` — The value to encode your cookies secrets with (required)
 *   - `serviceSecret` - An machine to machine shared secret that matches your auth servers (required)
 *   - `jwksKid` - The active jwks KID
 *   - `cookieDomain` — Domain attribute applied to all auth cookies
 *   - `accessCookieName` — Name of the session access cookie
 *   - `registrationCookieName` — Name of the ephemeral registration cookie
 *   - `refreshCookieName` — Name of the refresh token cookie
 *   - `preAuthCookieName` — Name of the cookie used during login initiation
 *
 * @returns An Express `Router` preconfigured with all Seamless Auth routes.
 */
export function createSeamlessAuthServer(
  opts: SeamlessAuthServerOptions,
): Router {
  const r = express.Router();

  r.use(express.json());
  r.use(cookieParser());

  const resolvedOpts: ResolvedSeamlessAuthServerOptions = {
    authServerUrl: opts.authServerUrl,
    issuer: opts.issuer,
    cookieSecret: opts.cookieSecret,
    serviceSecret: opts.serviceSecret,
    jwksKid: opts.jwksKid ?? "dev-main",
    cookieDomain: opts.cookieDomain ?? "",
    accessCookieName: opts.accessCookieName ?? "seamless-access",
    registrationCookieName: opts.registrationCookieName ?? "seamless-ephemeral",
    refreshCookieName: opts.refreshCookieName ?? "seamless-refresh",
    preAuthCookieName: opts.preAuthCookieName ?? "seamless-ephemeral",
  };

  const proxyWithIdentity =
    (
      path: string,
      identity: "preAuth" | "access" | "register",
      method: AuthFetchOptions["method"] = "POST",
    ) =>
    async (req: Request & { cookiePayload?: any }, res: Response) => {
      if (!req.cookiePayload?.sub) {
        res.status(401).json({ error: "unauthenticated" });
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
      const options =
        method == "GET"
          ? { method, authorization }
          : { method, authorization, body: req.body };

      const upstream = await authFetch(
        `${resolvedOpts.authServerUrl}/${path}`,
        options,
      );

      const data = await upstream.json();
      res.status(upstream.status).json(data);
    };

  r.use(
    createEnsureCookiesMiddleware({
      authServerUrl: resolvedOpts.authServerUrl,
      cookieDomain: resolvedOpts.cookieDomain,
      accessCookieName: resolvedOpts.accessCookieName,
      registrationCookieName: resolvedOpts.registrationCookieName,
      refreshCookieName: resolvedOpts.refreshCookieName,
      preAuthCookieName: resolvedOpts.preAuthCookieName,
      cookieSecret: resolvedOpts.cookieSecret,
      serviceSecret: resolvedOpts.serviceSecret,
      issuer: resolvedOpts.issuer,
      audience: resolvedOpts.authServerUrl,
      keyId: resolvedOpts.jwksKid,
    } as EnsureCookiesOptions),
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

  r.post(
    "/otp/verify-phone-otp",
    proxyWithIdentity("otp/verify-phone-otp", "preAuth"),
  );
  r.post(
    "/otp/verify-email-otp",
    proxyWithIdentity("otp/verify-email-otp", "preAuth"),
  );

  r.post("/login", (req, res) => login(req, res, resolvedOpts));
  r.post("/registration/register", (req, res) =>
    register(req, res, resolvedOpts),
  );

  r.get("/users/me", (req, res) => me(req, res, resolvedOpts));
  r.get("/logout", (req, res) => logout(req, res, resolvedOpts));

  r.post("/users/update", proxyWithIdentity("users/update", "access"));
  r.post(
    "/users/credentials",
    proxyWithIdentity("users/credentials", "access"),
  );
  r.delete(
    "/users/credentials",
    proxyWithIdentity("users/credentials", "access"),
  );

  return r;
}
