import type { Request } from "express";
import { getSeamlessUser as getSeamlessUserCore } from "@seamless-auth/core";

export async function getSeamlessUser<T = any>(
  req: Request,
  authServerUrl: string,
  cookieName: string = "seamless-access",
): Promise<T | null> {
  return getSeamlessUserCore<T>(req.cookies ?? {}, {
    authServerUrl,
    cookieSecret: process.env.COOKIE_SIGNING_KEY!,
    cookieName,
  });
}
