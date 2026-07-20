import { Request, Response } from "express";
import {
  finishOAuthLoginHandler,
  listOAuthProvidersHandler,
  startOAuthLoginHandler,
} from "@seamless-auth/core/handlers/oauthHandlers";
import { SeamlessAuthServerOptions } from "../createServer";
import { buildProxyServiceAuthorization } from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { buildCookieSigner, setSessionCookie } from "../internal/cookie";

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
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
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
  const cookieSigner = buildCookieSigner(opts);

  const result = await finishOAuthLoginHandler(
    {
      providerId: routeParam(req, "providerId"),
      body: req.body,
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
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
        cookieSigner,
      );
    }
  }

  if (result.error) {
    return res.status(result.status).json(result.error);
  }

  return res.status(result.status).json(result.body);
}
