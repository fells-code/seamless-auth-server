import type { AppliableResult, SessionCookie } from "./applyResult.js";
import { authFetch } from "./authFetch.js";
import type { AuthServerIssuerOption } from "./authServerIssuer.js";
import type { SeamlessAuthMessagingOptions } from "./authMessaging.js";
import { EXTERNAL_DELIVERY_HEADERS } from "./apiContract.js";
import { withoutTokens } from "./bodyTokens.js";
import { applyExternalDelivery } from "./deliverAuthMessage.js";
import {
  type AdapterHeld,
  type AdapterManifestRoute,
  buildManifestPath,
} from "./manifest/adapterManifest.js";
import {
  buildUpstreamUrl,
  checkProxyIdentity,
  type QueryInput,
} from "./proxyRequest.js";
import type { AuthTransport } from "./transport.js";
import { readPassthroughFailure } from "./upstreamError.js";
import {
  issueSessionCookies,
  type UpstreamSessionResponse,
  verifyUpstreamSession,
} from "./upstreamSession.js";
import { extractBearerToken } from "./verifyAccessToken.js";

export interface ManifestProxyInput {
  route: AdapterManifestRoute;
  params: Record<string, string>;
  transport: AuthTransport;
  query?: QueryInput;
  body?: unknown;
  /** The raw `Authorization` header, read in bearer transport. */
  authorization?: string;
  /** The verified payload `ensureCookies` loaded for this route's credential. */
  cookiePayload?: { sub?: string; token?: string };
  cookies: Record<string, unknown>;
  forwardedClientIp?: string;
  forwardedUserAgent?: string;
}

export interface ManifestProxyOptions extends AuthServerIssuerOption {
  authServerUrl: string;
  audience: string;
  cookieDomain?: string;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  preAuthCookieName: string;
  /** The adapter's proxy service token, which lets the API trust forwarded client context. */
  serviceAuthorization?: string;
  /** Sent instead of `serviceAuthorization` on a delivery route when `messaging` is set. */
  deliveryAuthorization?: string;
  messaging?: SeamlessAuthMessagingOptions;
}

const IDENTITY = {
  access: "access",
  preAuth: "preAuth",
  registration: "register",
} as const;

function cookieNameFor(held: AdapterHeld, opts: ManifestProxyOptions) {
  return {
    access: opts.accessCookieName,
    preAuth: opts.preAuthCookieName,
    registration: opts.registrationCookieName,
    refresh: opts.refreshCookieName,
  }[held];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUpstreamSession(value: unknown): value is UpstreamSessionResponse {
  return (
    isObject(value) &&
    typeof value.token === "string" &&
    typeof value.sub === "string"
  );
}

/** The body a cookie-transport caller receives: a `pick`, or everything but tokens. */
function cookieTransportBody(route: AdapterManifestRoute, data: unknown) {
  if (!isObject(data) || !route.body) return withoutTokens(data);

  return Object.fromEntries(
    route.body.pick.filter((key) => key in data).map((key) => [key, data[key]]),
  );
}

async function cookiesFor(
  route: AdapterManifestRoute,
  data: UpstreamSessionResponse,
  opts: ManifestProxyOptions,
): Promise<SessionCookie[]> {
  if (route.issues === "preAuth" || route.issues === "registration") {
    await verifyUpstreamSession(
      data,
      opts.authServerUrl,
      opts.audience,
      opts.authServerIssuer,
    );

    return [
      {
        name: cookieNameFor(route.issues, opts),
        value: { sub: data.sub, token: data.token },
        ttl: data.ttl,
        domain: opts.cookieDomain,
      },
    ];
  }

  return issueSessionCookies(data, {
    authServerUrl: opts.authServerUrl,
    audience: opts.audience,
    authServerIssuer: opts.authServerIssuer,
    accessCookieName: opts.accessCookieName,
    refreshCookieName:
      route.issues === "session" ? opts.refreshCookieName : undefined,
    cookieDomain: opts.cookieDomain,
  });
}

function isJson(contentType: string | null | undefined) {
  return !contentType || /\bjson\b/i.test(contentType);
}

/**
 * Proxies a route the adapter has no dedicated handler for, following what the
 * manifest says about it.
 *
 * A response only issues cookies when it actually carries a session: an OTP
 * verify on a phone-first signup step, for example, succeeds without one.
 */
export async function handleManifestRoute(
  input: ManifestProxyInput,
  opts: ManifestProxyOptions,
): Promise<AppliableResult> {
  const { route } = input;

  if (route.credential === "refresh") {
    return { status: 404, errorCode: "route_not_supported" };
  }

  if (route.credential !== "none") {
    const rejection = checkProxyIdentity({
      subject: input.cookiePayload?.sub,
      cookies: input.cookies,
      identity: IDENTITY[route.credential],
      accessCookieName: opts.accessCookieName,
      preAuthCookieName: opts.preAuthCookieName,
      registrationCookieName: opts.registrationCookieName,
      transport: input.transport,
      authorization: input.authorization,
    });

    if (rejection) {
      return { status: rejection.status, errorCode: rejection.errorCode };
    }
  }

  const authorization =
    route.credential === "none"
      ? undefined
      : input.transport === "bearer"
        ? `Bearer ${extractBearerToken(input.authorization)}`
        : `Bearer ${input.cookiePayload?.token}`;

  const externalDelivery = Boolean(route.delivery && opts.messaging);

  const upstream = await authFetch(
    buildUpstreamUrl(
      opts.authServerUrl,
      buildManifestPath(route, input.params),
      input.query,
    ),
    {
      method: route.method,
      authorization,
      serviceAuthorization: externalDelivery
        ? opts.deliveryAuthorization
        : opts.serviceAuthorization,
      forwardedClientIp: input.forwardedClientIp,
      forwardedUserAgent: input.forwardedUserAgent,
      ...(externalDelivery ? { headers: { ...EXTERNAL_DELIVERY_HEADERS } } : {}),
      ...(route.method === "GET" ? {} : { body: input.body }),
    },
  );

  if (upstream.ok && !isJson(upstream.headers?.get("content-type"))) {
    const headers: Record<string, string> = {};

    for (const name of ["content-type", "content-disposition", "cache-control"]) {
      const value = upstream.headers.get(name);
      if (value !== null) headers[name] = value;
    }

    return { status: upstream.status, raw: { headers, body: upstream.body } };
  }

  let data: unknown = await upstream.json();

  if (!upstream.ok) {
    return { status: upstream.status, ...readPassthroughFailure(data) };
  }

  if (externalDelivery) {
    data = await applyExternalDelivery(opts.messaging, data);
  }

  const clearCookies = route.clears
    ? [...new Set(route.clears.map((held) => cookieNameFor(held, opts)))]
    : undefined;

  if (input.transport === "bearer") {
    if (route.issues && isUpstreamSession(data)) {
      await verifyUpstreamSession(
        data,
        opts.authServerUrl,
        opts.audience,
        opts.authServerIssuer,
      );
    }

    return { status: upstream.status, body: data };
  }

  const setCookies =
    route.issues && isUpstreamSession(data)
      ? await cookiesFor(route, data, opts)
      : undefined;

  return {
    status: upstream.status,
    body: cookieTransportBody(route, data),
    ...(setCookies ? { setCookies } : {}),
    ...(clearCookies ? { clearCookies } : {}),
  };
}
