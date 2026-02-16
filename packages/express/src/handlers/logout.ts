import { Request, Response } from "express";
import { logoutHandler } from "@seamless-auth/core/handlers/logout";
import { clearAllCookies } from "../internal/cookie";
import { SeamlessAuthServerOptions } from "../createServer";

export async function logout(
  req: Request,
  res: Response,
  opts: SeamlessAuthServerOptions,
) {
  const result = await logoutHandler({
    authServerUrl: opts.authServerUrl,
    accessCookieName: opts.accessCookieName!,
    registrationCookieName: opts.registrationCookieName!,
    refreshCookieName: opts.refreshCookieName!,
  });

  clearAllCookies(res, opts.cookieDomain || "", ...result.clearCookies);

  res.status(result.status).end();
}
