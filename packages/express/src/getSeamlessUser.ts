import type { Request } from "express";
import {
  getSeamlessUser as getSeamlessUserCore,
  GetSeamlessUserOptions,
} from "@seamless-auth/core";
import { buildServiceAuthorization } from "./internal/buildAuthorization";
import { SeamlessAuthServerOptions } from "./createServer";

export async function getSeamlessUser(
  req: Request,
  opts: SeamlessAuthServerOptions,
) {
  const authorization = buildServiceAuthorization(req, opts);

  return getSeamlessUserCore(req.cookies ?? {}, {
    authServerUrl: opts.authServerUrl,
    cookieSecret: opts.cookieSecret,
    cookieName: opts.accessCookieName ?? "seamless-access",
    authorization,
  } as GetSeamlessUserOptions);
}
