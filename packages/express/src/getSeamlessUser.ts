import type { Request } from "express";
import {
  getSeamlessUser as getSeamlessUserCore,
  GetSeamlessUserOptions,
} from "@seamless-auth/core";
import { buildServiceAuthorization } from "./internal/buildAuthorization";

export async function getSeamlessUser(
  req: Request,
  opts: {
    authServerUrl: string;
    cookieSecret: string;
    cookieName?: string;
  },
) {
  const authorization = buildServiceAuthorization(req);

  return getSeamlessUserCore(req.cookies ?? {}, {
    authServerUrl: opts.authServerUrl,
    cookieSecret: opts.cookieSecret,
    cookieName: opts.cookieName ?? "seamless-access",
    authorization,
  } as GetSeamlessUserOptions);
}
