import { Request, Response } from "express";
import {
  finishOAuthLoginHandler,
  listOAuthProvidersHandler,
  startOAuthLoginHandler,
} from "@seamless-auth/core/handlers/oauthHandlers";
import { SeamlessAuthServerOptions } from "../createServer";
import { buildProxyServiceAuthorization } from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { buildForwardedUserAgent } from "../internal/buildForwardedUserAgent";
import { respond } from "../internal/respond";
import { transportOf } from "../internal/transport";

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

  respond(res, result, opts);
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
      forwardedUserAgent: buildForwardedUserAgent(req),
    },
    {
      authServerUrl: opts.authServerUrl,
    },
  );

  respond(res, result, opts);
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
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      forwardedUserAgent: buildForwardedUserAgent(req),
    },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
      refreshCookieName: opts.refreshCookieName!,
      transport: transportOf(req),
    },
  );

  respond(res, result, opts);
}
