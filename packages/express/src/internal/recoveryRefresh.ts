import type { Request, Response } from "express";
import type { AppliableResult, SessionCookie } from "@seamless-auth/core";

export type RecoveryRefresh = (
  status: number,
) => Promise<SessionCookie[] | undefined>;

export type RequestWithRecoveryRefresh = Request & {
  seamlessRecoveryRefresh?: RecoveryRefresh;
};

/**
 * Adds the rotated session cookies after a recovery session enrolls a factor.
 *
 * The silent refresh earlier in this request already wrote cookies of the same
 * names, and Express appends rather than replaces, so those are dropped first.
 */
export async function withRecoveryRefresh(
  req: RequestWithRecoveryRefresh,
  res: Response,
  result: AppliableResult,
): Promise<AppliableResult> {
  const cookies = await req.seamlessRecoveryRefresh?.(result.status);
  if (!cookies) return result;

  const names = new Set(cookies.map((cookie) => cookie.name));
  const written = res.getHeader("Set-Cookie");
  if (Array.isArray(written)) {
    res.setHeader(
      "Set-Cookie",
      written.filter((header) => !names.has(header.split("=")[0])),
    );
  }

  return { ...result, setCookies: [...(result.setCookies ?? []), ...cookies] };
}
