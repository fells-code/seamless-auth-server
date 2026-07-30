import { Request, Response } from "express";
import { switchOrganizationHandler } from "@seamless-auth/core/handlers/switchOrganizationHandler";
import { respond } from "../internal/respond";
import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { SeamlessAuthServerOptions } from "../createServer";

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

export async function switchOrganization(
  req: Request & { cookiePayload?: any },
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await switchOrganizationHandler(
    {
      organizationId: routeParam(req, "organizationId"),
      authorization: buildServiceAuthorization(req, opts),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
    },
  );

  respond(res, result, opts);
}
