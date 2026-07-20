import { isIP } from "node:net";

import { Request } from "express";

export type ClientIpResolver = (req: Request) => string | undefined;

let warnedBlanketTrustProxy = false;

// With `trust proxy` set to blanket true, Express derives req.ip from the leftmost
// X-Forwarded-For entry, which any client can set. Forwarding that upstream would let
// a caller pick its own rate-limit and audit identity, so drop it instead.
function derivedFromTrustedHop(req: Request): string | undefined {
  if (req.app?.get?.("trust proxy") === true) {
    if (!warnedBlanketTrustProxy) {
      warnedBlanketTrustProxy = true;
      console.warn(
        "[seamless-auth] Express 'trust proxy' is set to true, so req.ip is client-controlled. " +
          "The client IP will not be forwarded to the auth API. Set 'trust proxy' to an explicit " +
          "hop count or subnet, or pass resolveClientIp to createSeamlessAuthServer.",
      );
    }

    return undefined;
  }

  return req.ip;
}

export function buildForwardedClientIp(
  req: Request,
  resolveClientIp?: ClientIpResolver,
): string | undefined {
  const candidate = resolveClientIp
    ? resolveClientIp(req)
    : derivedFromTrustedHop(req);

  return candidate && isIP(candidate) !== 0 ? candidate : undefined;
}
