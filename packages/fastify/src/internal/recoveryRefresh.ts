import type { FastifyRequest } from "fastify";
import type { AppliableResult } from "@seamless-auth/core";

/** Adds the rotated session cookies after a recovery session enrolls a factor. */
export async function withRecoveryRefresh(
  req: FastifyRequest,
  result: AppliableResult,
): Promise<AppliableResult> {
  const cookies = await req.seamlessRecoveryRefresh?.(result.status);
  if (!cookies) return result;

  return { ...result, setCookies: [...(result.setCookies ?? []), ...cookies] };
}
