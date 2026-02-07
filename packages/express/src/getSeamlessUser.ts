import type { Request } from "express";
import {
  getSeamlessUser as getSeamlessUserCore,
  GetSeamlessUserOptions,
} from "@seamless-auth/core";
import { buildServiceAuthorization } from "./internal/buildAuthorization";

export async function getSeamlessUser(
  req: Request,
  authServerUrl: string,
  cookieName: string = "seamless-access",
) {
  const authorization = buildServiceAuthorization(req);

  return getSeamlessUserCore(req.cookies ?? {}, {
    authServerUrl,
    cookieSecret: process.env.COOKIE_SIGNING_KEY!,
    cookieName,
    authorization,
  } as GetSeamlessUserOptions);
}
