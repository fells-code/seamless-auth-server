import { BlockList, isIP } from "node:net";

import type { ClientIpResolver } from "../options.js";

export interface ClientIpOptions {
  resolveClientIp?: ClientIpResolver;
  trustedProxies?: string[];
}

const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

function unmap(address: string): string {
  return MAPPED_IPV4.exec(address)?.[1] ?? address;
}

function family(address: string): "ipv4" | "ipv6" | undefined {
  const version = isIP(address);
  return version === 4 ? "ipv4" : version === 6 ? "ipv6" : undefined;
}

/**
 * Builds the matcher for `trustedProxies`. A bad entry throws, so a typo fails
 * at setup instead of silently trusting less than the deployer meant.
 */
export function compileTrustedProxies(
  proxies: string[],
): (address: string) => boolean {
  const list = new BlockList();

  for (const entry of proxies) {
    const [rawAddress, prefix, ...rest] = String(entry).trim().split("/");
    const address = unmap(rawAddress ?? "");
    const kind = family(address);
    const bits = kind === "ipv4" ? 32 : 128;
    const length = prefix === undefined ? bits : Number(prefix);

    if (
      !kind ||
      rest.length > 0 ||
      (prefix !== undefined && !/^\d{1,3}$/.test(prefix)) ||
      length > bits
    ) {
      throw new Error(
        `trustedProxies: "${entry}" is not an IP address or CIDR range`,
      );
    }

    list.addSubnet(address, length, kind);
  }

  return (candidate) => {
    const address = unmap(candidate);
    const kind = family(address);
    return kind !== undefined && list.check(address, kind);
  };
}

/**
 * Walks `X-Forwarded-For` from the right, skipping trusted proxies, and returns
 * the first hop that is not one. A route handler never sees the connecting
 * peer, so the walk starts at the last hop a trusted proxy appended. There is
 * deliberately no hop count: it cannot tell a proxy from a client that sent its
 * own header.
 */
export function walkForwardedFor(
  header: string | null,
  trusted: (address: string) => boolean,
): string | undefined {
  const hops = (header ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);

  for (let i = hops.length - 1; i >= 0; i -= 1) {
    if (!trusted(hops[i] as string)) {
      return hops[i];
    }
  }

  return hops[0];
}

/**
 * The client address to forward, from `resolveClientIp` when given, otherwise
 * from `trustedProxies`. Neither set forwards none.
 */
export function createClientIpResolver(
  opts: ClientIpOptions,
): (request: Request) => string | undefined {
  const { resolveClientIp, trustedProxies } = opts;
  const trusted =
    !resolveClientIp && trustedProxies?.length
      ? compileTrustedProxies(trustedProxies)
      : undefined;

  return (request) => {
    const candidate = resolveClientIp
      ? resolveClientIp(request)
      : trusted
        ? walkForwardedFor(request.headers.get("x-forwarded-for"), trusted)
        : undefined;

    if (!candidate) {
      return undefined;
    }

    const address = unmap(candidate.trim());
    return isIP(address) !== 0 ? address : undefined;
  };
}

let warnedNoClientIp = false;

export function warnOnNoClientIp(opts: ClientIpOptions): void {
  if (opts.resolveClientIp || opts.trustedProxies?.length || warnedNoClientIp) {
    return;
  }

  warnedNoClientIp = true;
  console.warn(
    "[SEAMLESS-AUTH-NEXTJS] - Neither resolveClientIp nor trustedProxies is set, so no client IP is forwarded to the auth API and its rate limits and audit log see none. Set trustedProxies to your proxy addresses, or resolveClientIp to read the header your platform sets.",
  );
}
