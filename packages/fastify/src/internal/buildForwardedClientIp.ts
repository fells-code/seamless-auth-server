import { isIP } from "node:net";

import type { FastifyRequest } from "fastify";

export type ClientIpResolver = (req: FastifyRequest) => string | undefined;

// Documentation addresses (RFC 5737), which no real proxy has. A trust policy that
// accepts them as proxies accepts any address, so request.ip is whatever the
// client put first in X-Forwarded-For.
const PROBE_PEER = "203.0.113.9";
const PROBE_CLIENT = "198.51.100.7";
const PROBE_FORWARDED_FOR = `${PROBE_CLIENT}, 198.51.100.8`;

const trustsEveryAddress = new WeakMap<object, boolean>();

let warnedBlanketTrustProxy = false;
let warnedUntrustedProxy = false;

function ipGetter(req: FastifyRequest): (() => unknown) | undefined {
  for (
    let proto: object | null = Object.getPrototypeOf(req);
    proto;
    proto = Object.getPrototypeOf(proto)
  ) {
    const getter = Object.getOwnPropertyDescriptor(proto, "ip")?.get;
    if (getter) return getter;
  }

  return undefined;
}

/**
 * Whether the application's `trustProxy` trusts any address as a proxy.
 *
 * Fastify keeps `trustProxy` in a closure and does not expose it, so it cannot be
 * read. Instead this asks Fastify's own `request.ip` about a request from a
 * documentation address. Decided once per request class.
 */
function trustsAnyAddress(req: FastifyRequest): boolean {
  const proto = Object.getPrototypeOf(req) as object;
  const known = trustsEveryAddress.get(proto);
  if (known !== undefined) return known;

  let trustsAll = false;
  const getter = ipGetter(req);

  if (getter) {
    const socket = { remoteAddress: PROBE_PEER };
    const headers = { "x-forwarded-for": PROBE_FORWARDED_FOR };
    const raw = { headers, socket, connection: socket };

    try {
      trustsAll = getter.call({ raw, headers, socket }) === PROBE_CLIENT;
    } catch {
      trustsAll = false;
    }
  }

  trustsEveryAddress.set(proto, trustsAll);
  return trustsAll;
}

function derivedFromTrustedHop(req: FastifyRequest): string | undefined {
  if (trustsAnyAddress(req)) {
    if (!warnedBlanketTrustProxy) {
      warnedBlanketTrustProxy = true;
      console.warn(
        "[seamless-auth] Fastify 'trustProxy' trusts every address (for example `true`), so request.ip is client-controlled. " +
          "The client IP will not be forwarded to the auth API. Set 'trustProxy' to the proxy's address or subnet, " +
          "or pass resolveClientIp to the plugin.",
      );
    }

    return undefined;
  }

  // A proxy is adding X-Forwarded-For but nothing trusts it, so request.ip is the
  // proxy and every user would reach the auth API from one address. This is what a
  // hop count does on Fastify 5.12.1 and later, which ignores it.
  if (
    !warnedUntrustedProxy &&
    req.headers["x-forwarded-for"] !== undefined &&
    req.ip === req.socket?.remoteAddress
  ) {
    warnedUntrustedProxy = true;
    console.warn(
      "[seamless-auth] Requests carry X-Forwarded-For, but Fastify's 'trustProxy' trusts no proxy, so request.ip is the " +
        "connecting peer. If this app is behind a proxy, set 'trustProxy' to the proxy's address or subnet (Fastify " +
        "5.12.1 and later ignore a hop count), or pass resolveClientIp to the plugin.",
    );
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
