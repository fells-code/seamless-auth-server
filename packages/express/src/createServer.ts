import express, { Request, Response, Router } from "express";
import cookieParser from "cookie-parser";
import {
  setSessionCookie,
  clearAllCookies,
  clearSessionCookie,
} from "./internal/cookie";
import { authFetch } from "./internal/authFetch";
import type { SeamlessAuthServerOptions } from "./types";
import { createEnsureCookiesMiddleware } from "./middleware/ensureCookies";
import { verifySignedAuthResponse } from "./internal/verifySignedAuthResponse";

export function createSeamlessAuthServer(
  opts: SeamlessAuthServerOptions
): Router {
  const r = express.Router();
  r.use(express.json());
  r.use(cookieParser());

  const {
    authServerUrl,
    cookieDomain = "",
    accesscookieName = "seamless-auth-access",
    registrationCookieName = "seamless-auth-registration",
    refreshCookieName = "seamless-auth-refresh",
    preAuthCookieName = "seamless-auth-pre-auth",
  } = opts;

  const proxy =
    (
      path: string,
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "POST"
    ) =>
    async (req: Request, res: Response) => {
      try {
        const response = await authFetch(req, `${authServerUrl}/${path}`, {
          method,
          body: req.body,
        });
        res.status(response.status).json(await response.json());
      } catch (error) {
        console.error(`Failed to proxy to route. Error: ${error}`);
      }
    };

  r.use(
    createEnsureCookiesMiddleware({
      authServerUrl,
      cookieDomain,
      accesscookieName,
      registrationCookieName,
      refreshCookieName,
      preAuthCookieName,
    })
  );

  r.post("/webAuthn/login/start", proxy("webAuthn/login/start"));
  r.post("/webAuthn/login/finish", finishLogin);
  r.get("/webAuthn/register/start", proxy("webAuthn/register/start", "GET"));
  r.post("/webAuthn/register/finish", finishRegister);
  r.post("/otp/verify-phone-otp", proxy("otp/verify-phone-otp"));
  r.post("/otp/verify-email-otp", proxy("otp/verify-email-otp"));
  r.post("/login", login);
  r.post("/users/update", proxy("users/update"));
  r.post("/registration/register", register);
  r.get("/users/me", me);
  r.get("/logout", logout);

  return r;

  async function login(req: Request, res: Response) {
    const up = await authFetch(req, `${authServerUrl}/login`, {
      method: "POST",
      body: req.body,
    });
    const data = (await up.json()) as any;
    if (!up.ok) return res.status(up.status).json(data);

    const verified = await verifySignedAuthResponse(data.token, authServerUrl);

    if (!verified) {
      throw new Error("Invalid signed response from Auth Server");
    }

    if (verified.sub !== data.sub) {
      throw new Error("Signature mismatch with data payload");
    }

    setSessionCookie(
      res,
      { sub: data.sub },
      cookieDomain,
      data.ttl,
      preAuthCookieName
    );
    res.status(204).end();
  }

  async function register(req: Request, res: Response) {
    const up = await authFetch(req, `${authServerUrl}/registration/register`, {
      method: "POST",
      body: req.body,
    });
    const data = (await up.json()) as any;
    if (!up.ok) return res.status(up.status).json(data);

    setSessionCookie(
      res,
      { sub: data.sub },
      cookieDomain,
      data.ttl,
      registrationCookieName
    );
    res.status(200).json(data).end();
  }

  async function finishLogin(req: Request, res: Response) {
    const up = await authFetch(req, `${authServerUrl}/webAuthn/login/finish`, {
      method: "POST",
      body: req.body,
    });
    const data = (await up.json()) as any;
    if (!up.ok) return res.status(up.status).json(data);

    const verifiedAccessToken = await verifySignedAuthResponse(
      data.token,
      authServerUrl
    );

    if (!verifiedAccessToken) {
      throw new Error("Invalid signed response from Auth Server");
    }

    if (verifiedAccessToken.sub !== data.sub) {
      throw new Error("Signature mismatch with data payload");
    }

    setSessionCookie(
      res,
      { sub: data.sub, roles: data.roles },
      cookieDomain,
      data.ttl,
      accesscookieName
    );

    setSessionCookie(
      res,
      { sub: data.sub, refreshToken: data.refreshToken },
      req.hostname,
      data.refreshTtl,
      refreshCookieName
    );

    res.status(200).json(data).end();
  }

  async function finishRegister(req: Request, res: Response) {
    const up = await authFetch(
      req,
      `${authServerUrl}/webAuthn/register/finish`,
      {
        method: "POST",
        body: req.body,
      }
    );
    const data = (await up.json()) as any;
    if (!up.ok) return res.status(up.status).json(data);

    setSessionCookie(
      res,
      { sub: data.sub, roles: data.roles },
      cookieDomain,
      data.ttl,
      accesscookieName
    );
    res.status(204).end();
  }

  async function logout(req: Request, res: Response) {
    await authFetch(req, `${authServerUrl}/logout`, {
      method: "GET",
    });

    clearAllCookies(
      res,
      cookieDomain,
      accesscookieName,
      registrationCookieName,
      refreshCookieName
    );
    res.status(204).end();
  }

  async function me(req: Request, res: Response) {
    const up = await authFetch(req, `${authServerUrl}/users/me`, {
      method: "GET",
    });
    const data = (await up.json()) as any;

    clearSessionCookie(res, cookieDomain, preAuthCookieName);
    if (!data.user) return res.status(401).json({ error: "unauthenticated" });
    res.json({ user: data.user });
  }
}
