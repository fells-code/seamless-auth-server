import { getSeamlessLogger } from "@seamless-auth/core";
import { isIP } from "node:net";

import { Request } from "express";

export type ClientIpResolver = (req: Request) => string | undefined;

// Documentation addresses (RFC 5737), which no real proxy has. A trust policy that
// accepts them as proxies accepts any address, so req.ip is whatever the client put
// first in X-Forwarded-For. The hop index is far past any real proxy chain, so a hop count, which trusts by
// position whatever the address, is not mistaken for trusting every address.
const PROBES: ReadonlyArray<readonly [string, number]> = [
  ["203.0.113.9", 0],
  ["198.51.100.8", 1],
  ["198.51.100.9", 99],
];

let warnedBlanketTrustProxy = false;

type TrustProxyFn = (addr: string, hop: number) => boolean;

/**
 * Whether the application's `trust proxy` trusts any address as a proxy.
 *
 * Asks Express's compiled trust function whether it trusts documentation addresses
 * as the peer and as hops behind it, which would make req.ip a client-written
 * X-Forwarded-For entry. A hop count or a named proxy address or subnet does not, so
 * those still forward.
 */
function trustsAnyAddress(req: Request): boolean {
  const setting = req.app?.get?.("trust proxy");
  if (setting === true) return true;

  const trust = req.app?.get?.("trust proxy fn") as TrustProxyFn | undefined;
  if (typeof trust !== "function") return false;

  try {
    return PROBES.every(([addr, hop]) => trust(addr, hop) === true);
  } catch {
    return false;
  }
}

function derivedFromTrustedHop(req: Request): string | undefined {
  if (trustsAnyAddress(req)) {
    if (!warnedBlanketTrustProxy) {
      warnedBlanketTrustProxy = true;
      getSeamlessLogger().warn(
        "[seamless-auth] Express 'trust proxy' trusts every address (for example `true`), so req.ip is client-controlled. " +
          "The client IP will not be forwarded to the auth API. Set 'trust proxy' to an explicit " +
          "hop count or the proxy's address or subnet, or pass resolveClientIp to createSeamlessAuthServer.",
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
