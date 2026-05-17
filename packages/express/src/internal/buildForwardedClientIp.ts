import { Request } from "express";

export function buildForwardedClientIp(req: Request): string | undefined {
  return req.ip || undefined;
}
