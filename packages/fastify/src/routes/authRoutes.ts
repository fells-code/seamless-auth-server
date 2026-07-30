import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  applyExternalDelivery,
  finishLoginHandler,
  finishOAuthLoginHandler,
  finishRegisterHandler,
  listOAuthProvidersHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  pollMagicLinkConfirmationHandler,
  proxyRequest,
  registerHandler,
  requestMagicLinkHandler,
  requestOtpHandler,
  startOAuthLoginHandler,
  switchOrganizationHandler,
  verifyLoginOtpHandler,
  verifyRegistrationOtpHandler,
  type LogoutScope,
} from "@seamless-auth/core";

import {
  buildInternalServiceAuthorization,
  buildProxyServiceAuthorization,
  buildServiceAuthorization,
} from "../internal/buildAuthorization";
import { buildForwardedClientIp } from "../internal/buildForwardedClientIp";
import { respond } from "../internal/respond";
import type { ResolvedOptions } from "../options";

function routeParam(req: FastifyRequest, name: string): string {
  const value = (req.params as Record<string, unknown>)[name];

  if (typeof value !== "string" || value === "") {
    throw new Error(`Missing route parameter "${name}"`);
  }

  return value;
}

export function registerAuthRoutes(
  fastify: FastifyInstance,
  opts: ResolvedOptions,
): void {
  const common = (req: FastifyRequest) => ({
    authServerUrl: opts.authServerUrl,
    forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
  });

  // A message-carrying flow asks the API for a delivery payload instead of
  // having it send the message, which needs the external-delivery identity.
  const deliveryServiceAuthorization = () =>
    opts.messaging
      ? buildInternalServiceAuthorization(opts)
      : buildProxyServiceAuthorization(opts);

  const sessionCookies = {
    audience: opts.audience,
    cookieDomain: opts.cookieDomain,
    accessCookieName: opts.accessCookieName,
    refreshCookieName: opts.refreshCookieName,
  };

  fastify.post("/login", async (req, reply) => {
    const result = await loginHandler(
      { body: req.body },
      {
        ...common(req),
        audience: opts.audience,
        cookieDomain: opts.cookieDomain,
        preAuthCookieName: opts.preAuthCookieName,
        serviceAuthorization: buildProxyServiceAuthorization(opts),
      },
    );

    respond(reply, result, opts);
  });

  fastify.post("/webAuthn/login/finish", async (req, reply) => {
    const result = await finishLoginHandler(
      {
        body: req.body,
        authorization: buildServiceAuthorization(req),
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      },
      { authServerUrl: opts.authServerUrl, ...sessionCookies },
    );

    respond(reply, result, opts);
  });

  fastify.post("/registration/register", async (req, reply) => {
    const result = await registerHandler(
      { body: req.body },
      {
        ...common(req),
        cookieDomain: opts.cookieDomain,
        registrationCookieName: opts.registrationCookieName,
        externalDelivery: Boolean(opts.messaging),
        serviceAuthorization: deliveryServiceAuthorization(),
      },
    );

    if (result.errorBody) {
      return respond(reply, result, opts);
    }

    const body = await applyExternalDelivery(opts.messaging, result.body);
    respond(reply, { ...result, body }, opts);
  });

  fastify.post("/webAuthn/register/finish", async (req, reply) => {
    const result = await finishRegisterHandler(
      {
        body: req.body,
        authorization: buildServiceAuthorization(req),
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      },
      { authServerUrl: opts.authServerUrl, ...sessionCookies },
    );

    respond(reply, { ...result, body: { message: "success" } }, opts);
  });

  const otpRoutes: Array<
    [string, "email" | "phone", "registration" | "login"]
  > = [
    ["/otp/generate-phone-otp", "phone", "registration"],
    ["/otp/generate-email-otp", "email", "registration"],
    ["/otp/generate-login-phone-otp", "phone", "login"],
    ["/otp/generate-login-email-otp", "email", "login"],
  ];

  for (const [path, kind, flow] of otpRoutes) {
    fastify.post(path, async (req, reply) => {
      const result = await requestOtpHandler(
        { kind, flow, authorization: buildServiceAuthorization(req) },
        {
          ...common(req),
          externalDelivery: Boolean(opts.messaging),
          serviceAuthorization: deliveryServiceAuthorization(),
        },
      );

      if (result.errorBody) {
        return respond(reply, result, opts);
      }

      const body = await applyExternalDelivery(opts.messaging, result.body);
      respond(reply, { ...result, body }, opts);
    });
  }

  const verifyRoutes: Array<[string, "email" | "phone", "login" | "register"]> =
    [
      ["/otp/verify-phone-otp", "phone", "register"],
      ["/otp/verify-email-otp", "email", "register"],
      ["/otp/verify-login-phone-otp", "phone", "login"],
      ["/otp/verify-login-email-otp", "email", "login"],
    ];

  for (const [path, kind, flow] of verifyRoutes) {
    fastify.post(path, async (req, reply) => {
      const handler =
        flow === "register"
          ? verifyRegistrationOtpHandler
          : verifyLoginOtpHandler;

      const result = await handler(
        {
          body: req.body,
          authorization: buildServiceAuthorization(req),
          serviceAuthorization: buildProxyServiceAuthorization(opts),
          forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
          kind,
        },
        { authServerUrl: opts.authServerUrl, ...sessionCookies },
      );

      respond(reply, result, opts);
    });
  }

  fastify.get("/oauth/providers", async (_req, reply) => {
    respond(
      reply,
      await listOAuthProvidersHandler({ authServerUrl: opts.authServerUrl }),
      opts,
    );
  });

  fastify.post("/oauth/:providerId/start", async (req, reply) => {
    const result = await startOAuthLoginHandler(
      {
        providerId: routeParam(req, "providerId"),
        body: req.body,
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      },
      { authServerUrl: opts.authServerUrl },
    );

    respond(reply, result, opts);
  });

  fastify.post("/oauth/:providerId/callback", async (req, reply) => {
    const result = await finishOAuthLoginHandler(
      {
        providerId: routeParam(req, "providerId"),
        body: req.body,
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      },
      { authServerUrl: opts.authServerUrl, ...sessionCookies },
    );

    respond(reply, result, opts);
  });

  fastify.post("/magic-link", async (req, reply) => {
    const result = await requestMagicLinkHandler(
      { authorization: buildServiceAuthorization(req) },
      {
        ...common(req),
        externalDelivery: Boolean(opts.messaging),
        serviceAuthorization: deliveryServiceAuthorization(),
      },
    );

    if (result.errorBody) {
      return respond(reply, result, opts);
    }

    const body = await applyExternalDelivery(opts.messaging, result.body);
    respond(reply, { ...result, body }, opts);
  });

  // Verified by the link recipient, who holds no session yet, so this forwards
  // without an identity gate.
  fastify.get("/magic-link/verify/:token", async (req, reply) => {
    const result = await proxyRequest({
      authServerUrl: opts.authServerUrl,
      path: `magic-link/verify/${encodeURIComponent(routeParam(req, "token"))}`,
      method: "GET",
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    });

    respond(reply, result, opts);
  });

  fastify.get("/magic-link/check", async (req, reply) => {
    const result = await pollMagicLinkConfirmationHandler(
      {
        authorization: buildServiceAuthorization(req),
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      },
      {
        authServerUrl: opts.authServerUrl,
        ...sessionCookies,
        serviceAuthorization: deliveryServiceAuthorization(),
      },
    );

    respond(reply, result, opts);
  });

  fastify.post("/organizations/:organizationId/switch", async (req, reply) => {
    const result = await switchOrganizationHandler(
      {
        organizationId: routeParam(req, "organizationId"),
        authorization: buildServiceAuthorization(req),
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
      },
      {
        authServerUrl: opts.authServerUrl,
        audience: opts.audience,
        cookieDomain: opts.cookieDomain,
        accessCookieName: opts.accessCookieName,
      },
    );

    respond(reply, result, opts);
  });

  fastify.get("/users/me", async (req, reply) => {
    const result = await meHandler({
      authServerUrl: opts.authServerUrl,
      preAuthCookieName: opts.preAuthCookieName,
      authorization: buildServiceAuthorization(req),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
    });

    respond(reply, result, opts);
  });

  const logoutRoutes: Array<[string, LogoutScope]> = [
    ["/logout", "current_session"],
    ["/logout/all", "all_sessions"],
  ];

  for (const [path, scope] of logoutRoutes) {
    fastify.delete(path, async (req: FastifyRequest, reply: FastifyReply) => {
      const result = await logoutHandler({
        authServerUrl: opts.authServerUrl,
        accessCookieName: opts.accessCookieName,
        registrationCookieName: opts.registrationCookieName,
        refreshCookieName: opts.refreshCookieName,
        authorization: buildServiceAuthorization(req),
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        forwardedClientIp: buildForwardedClientIp(req, opts.resolveClientIp),
        scope,
      });

      respond(reply, result, opts);
    });
  }
}
