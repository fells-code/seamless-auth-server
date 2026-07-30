import { isIP } from "node:net";

import type { FastifyRequest } from "fastify";

export type ClientIpResolver = (req: FastifyRequest) => string | undefined;

let warnedBlanketTrustProxy = false;

// With `trustProxy` set to blanket true, Fastify derives request.ip from the
// leftmost X-Forwarded-For entry, which any client can set. Forwarding that
// upstream would let a caller pick its own rate-limit and audit identity, so drop
// it instead.
function derivedFromTrustedHop(req: FastifyRequest): string | undefined {
  if (
    (req.server as { initialConfig?: { trustProxy?: unknown } }).initialConfig
      ?.trustProxy === true
  ) {
    if (!warnedBlanketTrustProxy) {
      warnedBlanketTrustProxy = true;
      console.warn(
        "[seamless-auth] Fastify 'trustProxy' is set to true, so request.ip is client-controlled. " +
          "The client IP will not be forwarded to the auth API. Set 'trustProxy' to an explicit " +
          "hop count or subnet, or pass resolveClientIp to the plugin.",
      );
    }

    return undefined;
  }

  return req.ip;
}

export function buildForwardedClientIp(
  req: FastifyRequest,
  resolveClientIp?: ClientIpResolver,
): string | undefined {
  const candidate = resolveClientIp
    ? resolveClientIp(req)
    : derivedFromTrustedHop(req);

  return candidate && isIP(candidate) !== 0 ? candidate : undefined;
}
