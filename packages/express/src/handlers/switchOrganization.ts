import { Request, Response } from "express";
import { switchOrganizationHandler } from "@seamless-auth/core/handlers/switchOrganizationHandler";
import { buildCookieSigner, setSessionCookie } from "../internal/cookie";
import { buildServiceAuthorization } from "../internal/buildAuthorization";
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
  const cookieSigner = buildCookieSigner(opts);

  const result = await switchOrganizationHandler(
    {
      organizationId: routeParam(req, "organizationId"),
      authorization: buildServiceAuthorization(req, opts),
      forwardedClientIp: buildForwardedClientIp(req),
    },
    {
      authServerUrl: opts.authServerUrl,
      audience: opts.audience,
      cookieDomain: opts.cookieDomain,
      accessCookieName: opts.accessCookieName!,
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
