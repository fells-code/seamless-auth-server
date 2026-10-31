import type { AppliableResult, SessionCookie } from "./applyResult.js";
import { authFetch } from "./authFetch.js";
import { getSeamlessLogger } from "./logger.js";
import type { AuthServerIssuerOption } from "./authServerIssuer.js";
import type { SeamlessAuthMessagingOptions } from "./authMessaging.js";
import {
  AUTH_DELIVERY_KINDS_HEADER,
  EXTERNAL_DELIVERY_HEADERS,
} from "./apiContract.js";
import { withoutTokens } from "./bodyTokens.js";
import {
  applyExternalDelivery,
  deliverableNoticeKinds,
  deliverAuthMessage,
} from "./deliverAuthMessage.js";
import type { AuthDeliveryInstruction } from "./authMessaging.js";
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
  cookiePayload?: { sub?: string; token?: string; refreshed?: boolean };
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
      "ephemeral",
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
/**
 * Sends the owner notices the auth API handed back and drops them from the body: they
 * can carry a cancel link that only the account owner may see.
 *
 * The API counted them as the owner being told, so if none goes out the request they
 * announce is cancelled with the token in its link, and the caller gets the refusal the
 * API gives when it cannot notify the owner itself.
 */
async function deliverNotices(
  data: unknown,
  opts: ManifestProxyOptions,
): Promise<{ data: unknown; refused?: AppliableResult }> {
  if (!data || typeof data !== "object" || !("deliveries" in data)) {
    return { data };
  }

  const { deliveries, ...rest } = data as { deliveries?: unknown };
  const items = Array.isArray(deliveries)
    ? (deliveries as AuthDeliveryInstruction[])
    : [];
  let sent = 0;

  for (const delivery of items) {
    try {
      await deliverAuthMessage(opts.messaging, delivery);
      sent += 1;
    } catch (error) {
      getSeamlessLogger().error(
        `[SeamlessAuth] An account notice (${delivery.kind}) could not be sent: ${
          error instanceof Error ? error.name : "unknown error"
        }.`,
      );
    }
  }

  if (items.length === 0 || sent > 0) {
    return { data: rest };
  }

  const cancelToken = items
    .map((item) => ("cancelUrl" in item ? item.cancelUrl : undefined))
    .map((url) => url?.split("#")[1])
    .find(Boolean);

  if (cancelToken) {
    await authFetch(`${opts.authServerUrl}/recovery/cancel`, {
      method: "POST",
      serviceAuthorization: opts.serviceAuthorization,
      body: { cancelToken },
    });
  }

  return {
    data: rest,
    refused: { status: 503, errorCode: "recovery_notice_failed" },
  };
}

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
      refreshed: input.cookiePayload?.refreshed,
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
  // Without a kind it can send, the request goes out as before and the API sends the
  // notices itself.
  const noticeKinds = route.notices ? deliverableNoticeKinds(opts.messaging) : [];
  const ownsDelivery = externalDelivery || noticeKinds.length > 0;

  const upstream = await authFetch(
    buildUpstreamUrl(
      opts.authServerUrl,
      buildManifestPath(route, input.params),
      input.query,
    ),
    {
      method: route.method,
      authorization,
      serviceAuthorization: ownsDelivery
        ? opts.deliveryAuthorization
        : opts.serviceAuthorization,
      forwardedClientIp: input.forwardedClientIp,
      forwardedUserAgent: input.forwardedUserAgent,
      ...(ownsDelivery
        ? {
            headers: {
              ...EXTERNAL_DELIVERY_HEADERS,
              ...(noticeKinds.length > 0
                ? { [AUTH_DELIVERY_KINDS_HEADER]: noticeKinds.join(",") }
                : {}),
            },
          }
        : {}),
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

  if (noticeKinds.length > 0) {
    const notices = await deliverNotices(data, opts);

    if (notices.refused) {
      return notices.refused;
    }

    data = notices.data;
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
        route.issues === "preAuth" || route.issues === "registration"
          ? "ephemeral"
          : "access",
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
