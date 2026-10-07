import {
  applyCookies,
  assertSecrets,
  checkOrigin,
  checkProxyIdentity,
  DEV_JWKS_KID,
  ensureCookies,
  proxyRequest,
  redactSensitiveText,
  SERVICE_TOKEN_AUDIENCE,
  SERVICE_TOKEN_ISSUER,
} from "@seamless-auth/core";

import {
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "./internal/buildAuthorization";
import {
  BodyError,
  forwardedClientIp,
  forwardedUserAgent,
  mountRelativePath,
  readBody,
  readCookies,
  readQuery,
  transportOf,
  type AuthContext,
} from "./internal/context";
import { respond, ResponseCollector } from "./internal/respond";
import { matchRoute, type Route } from "./internal/router";
import type { ResolvedOptions, SeamlessAuthHandlerOptions } from "./options";
import { ADMIN_ROUTES } from "./routes/adminRoutes";
import { AUTH_ROUTES } from "./routes/authRoutes";
import { PROXY_ROUTES, resolveUpstreamPath } from "./routes/proxyRoutes";

export type RouteHandler = (request: Request) => Promise<Response>;

export interface SeamlessAuthRouteHandlers {
  GET: RouteHandler;
  POST: RouteHandler;
  PATCH: RouteHandler;
  DELETE: RouteHandler;
}

export function resolveOptions(
  opts: SeamlessAuthHandlerOptions,
): ResolvedOptions {
  return {
    ...opts,
    jwksKid: opts.jwksKid ?? DEV_JWKS_KID,
    cookieDomain: opts.cookieDomain ?? "",
    accessCookieName: opts.accessCookieName ?? "seamless-access",
    registrationCookieName: opts.registrationCookieName ?? "seamless-ephemeral",
    refreshCookieName: opts.refreshCookieName ?? "seamless-refresh",
    // Shares the registration cookie default on purpose: registration and login
    // initiation never hold an ephemeral cookie at the same time.
    preAuthCookieName: opts.preAuthCookieName ?? "seamless-ephemeral",
    basePath: opts.basePath ?? "/auth",
  };
}

const PASSTHROUGH_ROUTES: Route[] = PROXY_ROUTES.map((definition) => ({
  method: definition.method,
  path: definition.path,
  run: async (ctx, opts) => {
    const rejection = checkProxyIdentity({
      subject: ctx.cookiePayload?.sub,
      cookies: ctx.cookies,
      identity: definition.identity,
      accessCookieName: opts.accessCookieName,
      preAuthCookieName: opts.preAuthCookieName,
      registrationCookieName: opts.registrationCookieName,
      transport: ctx.transport,
      authorization: ctx.request.headers.get("authorization") ?? undefined,
    });

    if (rejection) {
      if (rejection.warn) {
        console.warn(`[SEAMLESS-AUTH-NEXTJS] - (proxy) - ${rejection.warn}`);
      }

      return { status: rejection.status, errorCode: rejection.errorCode };
    }

    return proxyRequest({
      authServerUrl: opts.authServerUrl,
      path: resolveUpstreamPath(definition.upstream, ctx.params),
      method: definition.method,
      authorization: buildServiceAuthorization(ctx),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: forwardedClientIp(ctx.request, opts.resolveClientIp),
      forwardedUserAgent: forwardedUserAgent(ctx.request),
      query: ctx.query,
      body: ctx.body,
      raw: definition.raw,
    });
  },
}));

// Mount order of the other adapters: handler-backed routes first, so a
// passthrough can never shadow one.
const ROUTES: Route[] = [
  ...AUTH_ROUTES,
  ...ADMIN_ROUTES,
  ...PASSTHROUGH_ROUTES,
];

function warnOnDevJwksKid(jwksKid: string | undefined): void {
  if (!jwksKid || jwksKid === DEV_JWKS_KID) {
    console.warn(
      `[SEAMLESS-AUTH-NEXTJS] - jwksKid is not set and defaults to "${DEV_JWKS_KID}". Set jwksKid explicitly to the active JWKS key id before deploying.`,
    );
  }
}

/**
 * Serves the Seamless Auth routes from a Next.js App Router catch-all route
 * and manages the session cookies they depend on.
 *
 * ### Example
 * ```ts
 * // app/auth/[...seamless]/route.ts
 * import { createSeamlessAuthHandler } from "@seamless-auth/nextjs";
 *
 * export const { GET, POST, PATCH, DELETE } = createSeamlessAuthHandler({
 *   authServerUrl: process.env.AUTH_SERVER_URL!,
 *   cookieSecret: process.env.COOKIE_SECRET!,
 *   serviceSecret: process.env.SERVICE_SECRET!,
 *   audience: process.env.AUTH_SERVER_URL!,
 *   jwksKid: process.env.JWKS_KID,
 * });
 * ```
 */
export function createSeamlessAuthHandler(
  options: SeamlessAuthHandlerOptions,
): SeamlessAuthRouteHandlers {
  assertSecrets(options);
  warnOnDevJwksKid(options.jwksKid);

  const opts = resolveOptions(options);

  async function handle(request: Request): Promise<Response> {
    const collector = new ResponseCollector();

    try {
      return await dispatch(request, opts, collector);
    } catch (error) {
      if (error instanceof BodyError) {
        return collector.json(error.status, { error: error.message });
      }

      console.error(
        "[SEAMLESS-AUTH-NEXTJS] - Unhandled route error.",
        redactSensitiveText(
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
        ),
      );
      // The same collector, so a refresh that ensureCookies already rotated
      // still reaches the browser. Dropping it would leave the browser holding a
      // spent refresh token, and its next refresh would revoke the session.
      return collector.json(500, { error: "internal_error" });
    }
  }

  return { GET: handle, POST: handle, PATCH: handle, DELETE: handle };
}

async function dispatch(
  request: Request,
  opts: ResolvedOptions,
  collector: ResponseCollector,
): Promise<Response> {
  // Ordering matches the other adapters: a blocked cross-site request must
  // never trigger a token refresh or reach a handler.
  const originRejection = checkOrigin({
    method: request.method,
    secFetchSite: request.headers.get("sec-fetch-site") ?? undefined,
    origin: request.headers.get("origin") ?? undefined,
    cookieSecure: opts.cookieSecure,
    cookieSameSite: opts.cookieSameSite,
    allowedOrigins: opts.allowedOrigins,
  });

  if (originRejection) {
    return collector.json(originRejection.status, {
      error: originRejection.errorCode,
    });
  }

  const url = new URL(request.url);
  const path = mountRelativePath(url.pathname, opts.basePath);
  const match = matchRoute(ROUTES, request.method, path);

  if (!match) {
    return collector.json(404, { error: "not_found" });
  }

  const ctx: AuthContext = {
    request,
    method: request.method,
    path,
    params: match.params,
    query: readQuery(url),
    body: await readBody(request),
    cookies: readCookies(request),
    transport: transportOf(request),
  };

  // A bearer client holds its own tokens and refreshes through /refresh, so
  // there is no cookie here to load or rotate.
  if (ctx.transport !== "bearer") {
    const result = await ensureCookies(
      { path, cookies: ctx.cookies },
      {
        authServerUrl: opts.authServerUrl,
        cookieDomain: opts.cookieDomain,
        accessCookieName: opts.accessCookieName,
        registrationCookieName: opts.registrationCookieName,
        refreshCookieName: opts.refreshCookieName,
        preAuthCookieName: opts.preAuthCookieName,
        cookieSecret: opts.cookieSecret,
        serviceSecret: opts.serviceSecret,
        // The silent-refresh path mints an M2M service token, which the auth API
        // validates against a fixed issuer and audience rather than the
        // adopter-configured one.
        issuer: SERVICE_TOKEN_ISSUER,
        audience: SERVICE_TOKEN_AUDIENCE,
        keyId: opts.jwksKid,
        forwardedClientIp: forwardedClientIp(request, opts.resolveClientIp),
        forwardedUserAgent: forwardedUserAgent(request),
      },
    );

    applyCookies(result, collector.adapter, opts);

    if (result.user) {
      ctx.cookiePayload = result.user;
    }

    if (result.type === "error") {
      return collector.json(result.status ?? 401, { error: result.errorCode });
    }
  }

  return respond(collector, ctx, await match.route.run(ctx, opts), opts);
}
