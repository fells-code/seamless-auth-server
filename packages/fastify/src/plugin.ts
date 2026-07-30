import cookie from "@fastify/cookie";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import {
  applyExternalDelivery,
  assertSecrets,
  checkProxyIdentity,
  DEV_JWKS_KID,
  proxyRequest,
  redactSensitiveText,
} from "@seamless-auth/core";

import { createEnsureCookiesHook } from "./hooks/ensureCookies";
import { createOriginGuardHook } from "./hooks/originGuard";
import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "./internal/buildAuthorization";
import { buildForwardedClientIp } from "./internal/buildForwardedClientIp";
import { respond } from "./internal/respond";
import type { ResolvedOptions, SeamlessAuthServerOptions } from "./options";
import { PROXY_ROUTES, resolveUpstreamPath } from "./routes/proxyRoutes";
import { registerAuthRoutes } from "./routes/authRoutes";
import { registerAdminRoutes } from "./routes/adminRoutes";

function warnOnDevJwksKid(jwksKid: string | undefined): void {
  if (!jwksKid || jwksKid === DEV_JWKS_KID) {
    console.warn(
      `[SEAMLESS-AUTH-FASTIFY] - jwksKid is not set and defaults to "${DEV_JWKS_KID}". Set jwksKid explicitly to the active JWKS key id before deploying.`,
    );
  }
}

function resolveOptions(opts: SeamlessAuthServerOptions): ResolvedOptions {
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
  };
}

/**
 * Fastify plugin that serves the Seamless Auth routes and manages the session
 * cookies they depend on.
 *
 * Register it under a prefix. Fastify's encapsulation keeps the cookie and
 * origin hooks scoped to these routes, so nothing else in the application is
 * affected.
 *
 * ### Example
 * ```ts
 * await app.register(seamlessAuth, {
 *   prefix: "/auth",
 *   authServerUrl: "https://identifier.seamlessauth.com",
 *   cookieSecret: process.env.COOKIE_SECRET!,
 *   serviceSecret: process.env.SERVICE_SECRET!,
 *   audience: "https://identifier.seamlessauth.com",
 *   jwksKid: "2024-09-main",
 * });
 * ```
 */
export const seamlessAuth: FastifyPluginAsync<
  SeamlessAuthServerOptions
> = async (fastify, opts) => {
  assertSecrets(opts);
  warnOnDevJwksKid(opts.jwksKid);

  const resolved = resolveOptions(opts);

  await fastify.register(cookie);

  // Ordering matches the Express adapter: a blocked cross-site request must
  // never trigger a token refresh or reach a handler.
  fastify.addHook("onRequest", createOriginGuardHook(resolved));
  fastify.addHook(
    "onRequest",
    createEnsureCookiesHook(resolved, fastify.prefix),
  );

  registerAuthRoutes(fastify, resolved);
  registerAdminRoutes(fastify, resolved);
  registerProxyRoutes(fastify, resolved);

  fastify.setErrorHandler((error, request, reply) => {
    const status = clientErrorStatus(error);

    if (status !== null) {
      reply.status(status).send({ error: "bad_request" });
      return;
    }

    request.log.error(
      redactSensitiveText(String((error as Error)?.stack ?? error)),
    );
    reply.status(500).send({ error: "internal_error" });
  });
};

function clientErrorStatus(err: unknown): number | null {
  const candidate = err as { status?: unknown; statusCode?: unknown } | null;
  const status =
    typeof candidate?.status === "number"
      ? candidate.status
      : typeof candidate?.statusCode === "number"
        ? candidate.statusCode
        : null;

  return status !== null && status >= 400 && status < 500 ? status : null;
}

function registerProxyRoutes(
  fastify: FastifyInstance,
  opts: ResolvedOptions,
): void {
  for (const route of PROXY_ROUTES) {
    fastify.route({
      method: route.method,
      url: route.path,
      handler: async (req: FastifyRequest, reply: FastifyReply) => {
        const rejection = checkProxyIdentity({
          subject: req.cookiePayload?.sub,
          cookies: req.cookies ?? {},
          identity: route.identity,
          accessCookieName: opts.accessCookieName,
          preAuthCookieName: opts.preAuthCookieName,
          registrationCookieName: opts.registrationCookieName,
        });

        if (rejection) {
          if (rejection.warn) {
            req.log.warn(
              `[SEAMLESS-AUTH-FASTIFY] - (proxy) - ${rejection.warn}`,
            );
          }

          return reply
            .status(rejection.status)
            .send({ error: rejection.errorCode });
        }

        const result = await proxyRequest({
          authServerUrl: opts.authServerUrl,
          path: resolveUpstreamPath(
            route.upstream,
            req.params as Record<string, unknown>,
          ),
          method: route.method,
          authorization: buildServiceAuthorization(req),
          serviceAuthorization: buildProxyServiceAuthorization(opts),
          forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
          query: req.query as Record<string, unknown>,
          body: req.body,
        });

        respond(reply, result, opts);
      },
    });
  }
}

export { applyExternalDelivery, buildInternalServiceAuthorization };
export default seamlessAuth;
