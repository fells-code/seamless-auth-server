import { Request, Response } from "express";
import {
  finishOAuthLoginHandler,
  listOAuthProvidersHandler,
  startOAuthLoginHandler,
} from "@seamless-auth/core/handlers/oauthHandlers";
import { SeamlessAuthServerOptions } from "../createServer";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { setSessionCookie } from "../internal/cookie";

function cookieSigner(opts: SeamlessAuthServerOptions) {
  if (!opts.cookieSecret) {
    throw new Error("Missing COOKIE_SIGNING_KEY");
  }

  return {
    secret: opts.cookieSecret,
    secure: process.env.NODE_ENV === "production",
    sameSite:
      process.env.NODE_ENV === "production"
        ? "none"
        : ("lax" as "none" | "lax"),
  };
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

export async function listOAuthProviders(
  _req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await listOAuthProvidersHandler({
    authServerUrl: opts.authServerUrl,
  });

  if ("error" in result) {
    return res.status(result.status).json(result.error);
  }

  return res.status(result.status).json(result.body);
}

export async function startOAuthLogin(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await startOAuthLoginHandler(
    {
      providerId: routeParam(req, "providerId"),
      body: req.body,
      forwardedClientIp: buildForwardedClientIp(req),
    },
    {
      authServerUrl: opts.authServerUrl,
    },
  );

  if ("error" in result) {
    return res.status(result.status).json(result.error);
  }

  return res.status(result.status).json(result.body);
}

export async function finishOAuthLogin(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await finishOAuthLoginHandler(
    {
      providerId: routeParam(req, "providerId"),
      body: req.body,
      forwardedClientIp: buildForwardedClientIp(req),
    },
    {
      authServerUrl: opts.authServerUrl,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
      refreshCookieName: opts.refreshCookieName!,
    },
  );

  if (result.setCookies) {
    for (const c of result.setCookies) {
      setSessionCookie(
        res,
        {
          name: c.name,
          payload: c.value,
          domain: c.domain,
          ttlSeconds: c.ttl,
        },
        cookieSigner(opts),
      );
    }
  }

  if (result.error) {
    return res.status(result.status).json(result.error);
  }

  return res.status(result.status).json(result.body);
}
