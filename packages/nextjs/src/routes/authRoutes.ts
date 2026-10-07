import {
  applyExternalDelivery,
  deleteAccountHandler,
  finishLoginHandler,
  finishOAuthLoginHandler,
  finishRegisterHandler,
  getPublicSystemConfigHandler,
  listOAuthProvidersHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  pollMagicLinkConfirmationHandler,
  proxyRequest,
  refreshHandler,
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
import {
  forwardedClientIp,
  forwardedUserAgent,
  type AuthContext,
} from "../internal/context";
import { param, type Route } from "../internal/router";
import type { ResolvedOptions } from "../options";

function forwarded(ctx: AuthContext, opts: ResolvedOptions) {
  return {
    forwardedClientIp: forwardedClientIp(ctx.request, opts.resolveClientIp),
    forwardedUserAgent: forwardedUserAgent(ctx.request),
  };
}

function common(ctx: AuthContext, opts: ResolvedOptions) {
  return { authServerUrl: opts.authServerUrl, ...forwarded(ctx, opts) };
}

// A message-carrying flow asks the API for a delivery payload instead of having
// it send the message, which needs the external-delivery identity.
function deliveryServiceAuthorization(opts: ResolvedOptions) {
  return opts.messaging
    ? buildInternalServiceAuthorization(opts)
    : buildProxyServiceAuthorization(opts);
}

function sessionCookies(ctx: AuthContext, opts: ResolvedOptions) {
  return {
    audience: opts.audience,
    authServerIssuer: opts.authServerIssuer,
    cookieDomain: opts.cookieDomain,
    accessCookieName: opts.accessCookieName,
    refreshCookieName: opts.refreshCookieName,
    transport: ctx.transport,
  };
}

const otpRequestRoutes: Route[] = (
  [
    ["/otp/generate-phone-otp", "phone", "registration"],
    ["/otp/generate-email-otp", "email", "registration"],
    ["/otp/generate-login-phone-otp", "phone", "login"],
    ["/otp/generate-login-email-otp", "email", "login"],
  ] as const
).map(([path, kind, flow]) => ({
  method: "POST",
  path,
  run: async (ctx, opts) => {
    const result = await requestOtpHandler(
      { kind, flow, authorization: buildServiceAuthorization(ctx) },
      {
        ...common(ctx, opts),
        externalDelivery: Boolean(opts.messaging),
        serviceAuthorization: deliveryServiceAuthorization(opts),
      },
    );

    if (result.errorBody) {
      return result;
    }

    return {
      ...result,
      body: await applyExternalDelivery(opts.messaging, result.body),
    };
  },
}));

const otpVerifyRoutes: Route[] = (
  [
    ["/otp/verify-phone-otp", "phone", "register"],
    ["/otp/verify-email-otp", "email", "register"],
    ["/otp/verify-login-phone-otp", "phone", "login"],
    ["/otp/verify-login-email-otp", "email", "login"],
  ] as const
).map(([path, kind, flow]) => ({
  method: "POST",
  path,
  run: (ctx, opts) => {
    const handler =
      flow === "register" ? verifyRegistrationOtpHandler : verifyLoginOtpHandler;

    return handler(
      {
        body: ctx.body,
        authorization: buildServiceAuthorization(ctx),
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        ...forwarded(ctx, opts),
        kind,
      },
      { authServerUrl: opts.authServerUrl, ...sessionCookies(ctx, opts) },
    );
  },
}));

const logoutRoutes: Route[] = (
  [
    ["/logout", "current_session"],
    ["/logout/all", "all_sessions"],
  ] as Array<[string, LogoutScope]>
).map(([path, scope]) => ({
  method: "DELETE",
  path,
  run: (ctx, opts) =>
    logoutHandler({
      authServerUrl: opts.authServerUrl,
      accessCookieName: opts.accessCookieName,
      registrationCookieName: opts.registrationCookieName,
      refreshCookieName: opts.refreshCookieName,
      authorization: buildServiceAuthorization(ctx),
      serviceAuthorization: buildProxyServiceAuthorization(opts),
      ...forwarded(ctx, opts),
      scope,
    }),
}));

/** The handler-backed auth routes, in the order the other adapters mount them. */
export const AUTH_ROUTES: Route[] = [
  {
    method: "POST",
    path: "/login",
    run: (ctx, opts) =>
      loginHandler(
        { body: ctx.body },
        {
          ...common(ctx, opts),
          audience: opts.audience,
          authServerIssuer: opts.authServerIssuer,
          cookieDomain: opts.cookieDomain,
          preAuthCookieName: opts.preAuthCookieName,
          transport: ctx.transport,
          serviceAuthorization: buildProxyServiceAuthorization(opts),
        },
      ),
  },
  {
    method: "POST",
    path: "/webAuthn/login/finish",
    run: (ctx, opts) =>
      finishLoginHandler(
        {
          body: ctx.body,
          authorization: buildServiceAuthorization(ctx),
          serviceAuthorization: buildProxyServiceAuthorization(opts),
          ...forwarded(ctx, opts),
        },
        { authServerUrl: opts.authServerUrl, ...sessionCookies(ctx, opts) },
      ),
  },
  {
    method: "POST",
    path: "/registration/register",
    run: async (ctx, opts) => {
      const result = await registerHandler(
        { body: ctx.body },
        {
          ...common(ctx, opts),
          cookieDomain: opts.cookieDomain,
          registrationCookieName: opts.registrationCookieName,
          transport: ctx.transport,
          externalDelivery: Boolean(opts.messaging),
          serviceAuthorization: deliveryServiceAuthorization(opts),
        },
      );

      if (result.errorBody) {
        return result;
      }

      return {
        ...result,
        body: await applyExternalDelivery(opts.messaging, result.body),
      };
    },
  },
  {
    method: "POST",
    path: "/webAuthn/register/finish",
    run: async (ctx, opts) => {
      const result = await finishRegisterHandler(
        {
          body: ctx.body,
          authorization: buildServiceAuthorization(ctx),
          serviceAuthorization: buildProxyServiceAuthorization(opts),
          ...forwarded(ctx, opts),
        },
        { authServerUrl: opts.authServerUrl },
      );

      return { ...result, body: { message: "success" } };
    },
  },
  ...otpRequestRoutes,
  ...otpVerifyRoutes,
  // Public: the sign-in screens read this before there is a session, so no
  // identity is forwarded and none is expected upstream.
  {
    method: "GET",
    path: "/system-config/public",
    run: (ctx, opts) => getPublicSystemConfigHandler(common(ctx, opts)),
  },
  {
    method: "GET",
    path: "/oauth/providers",
    run: (_ctx, opts) =>
      listOAuthProvidersHandler({ authServerUrl: opts.authServerUrl }),
  },
  {
    method: "POST",
    path: "/oauth/:providerId/start",
    run: (ctx, opts) =>
      startOAuthLoginHandler(
        {
          providerId: param(ctx, "providerId"),
          body: ctx.body,
          serviceAuthorization: buildProxyServiceAuthorization(opts),
          ...forwarded(ctx, opts),
        },
        { authServerUrl: opts.authServerUrl },
      ),
  },
  {
    method: "POST",
    path: "/oauth/:providerId/callback",
    run: (ctx, opts) =>
      finishOAuthLoginHandler(
        {
          providerId: param(ctx, "providerId"),
          body: ctx.body,
          serviceAuthorization: buildProxyServiceAuthorization(opts),
          ...forwarded(ctx, opts),
        },
        { authServerUrl: opts.authServerUrl, ...sessionCookies(ctx, opts) },
      ),
  },
  {
    method: "POST",
    path: "/magic-link",
    run: async (ctx, opts) => {
      const { redirectUri } = (ctx.body ?? {}) as { redirectUri?: unknown };

      const result = await requestMagicLinkHandler(
        {
          authorization: buildServiceAuthorization(ctx),
          redirectUri: typeof redirectUri === "string" ? redirectUri : undefined,
        },
        {
          ...common(ctx, opts),
          externalDelivery: Boolean(opts.messaging),
          serviceAuthorization: deliveryServiceAuthorization(opts),
        },
      );

      if (result.errorBody) {
        return result;
      }

      return {
        ...result,
        body: await applyExternalDelivery(opts.messaging, result.body),
      };
    },
  },
  // Verified by the link recipient, who holds no session yet, so this forwards
  // without an identity gate.
  {
    method: "GET",
    path: "/magic-link/verify/:token",
    run: (ctx, opts) =>
      proxyRequest({
        authServerUrl: opts.authServerUrl,
        path: `magic-link/verify/${encodeURIComponent(param(ctx, "token"))}`,
        method: "GET",
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        ...forwarded(ctx, opts),
      }),
  },
  {
    method: "GET",
    path: "/magic-link/check",
    run: (ctx, opts) =>
      pollMagicLinkConfirmationHandler(
        {
          authorization: buildServiceAuthorization(ctx),
          ...forwarded(ctx, opts),
        },
        {
          authServerUrl: opts.authServerUrl,
          ...sessionCookies(ctx, opts),
          serviceAuthorization: deliveryServiceAuthorization(opts),
        },
      ),
  },
  {
    method: "POST",
    path: "/organizations/:organizationId/switch",
    run: (ctx, opts) =>
      switchOrganizationHandler(
        {
          organizationId: param(ctx, "organizationId"),
          authorization: buildServiceAuthorization(ctx),
          serviceAuthorization: buildProxyServiceAuthorization(opts),
          ...forwarded(ctx, opts),
        },
        {
          authServerUrl: opts.authServerUrl,
          audience: opts.audience,
          authServerIssuer: opts.authServerIssuer,
          cookieDomain: opts.cookieDomain,
          accessCookieName: opts.accessCookieName,
          transport: ctx.transport,
        },
      ),
  },
  {
    method: "POST",
    path: "/refresh",
    run: (ctx, opts) =>
      refreshHandler(
        {
          transport: ctx.transport,
          authorization: ctx.request.headers.get("authorization") ?? undefined,
          refreshCookie: ctx.cookies[opts.refreshCookieName],
          serviceAuthorization: buildProxyServiceAuthorization(opts),
          ...forwarded(ctx, opts),
        },
        {
          authServerUrl: opts.authServerUrl,
          audience: opts.audience,
          authServerIssuer: opts.authServerIssuer,
          cookieSecret: opts.cookieSecret,
          serviceSecret: opts.serviceSecret,
          keyId: opts.jwksKid,
          cookieDomain: opts.cookieDomain,
          accessCookieName: opts.accessCookieName,
          refreshCookieName: opts.refreshCookieName,
        },
      ),
  },
  {
    method: "GET",
    path: "/users/me",
    run: (ctx, opts) =>
      meHandler({
        authServerUrl: opts.authServerUrl,
        preAuthCookieName: opts.preAuthCookieName,
        authorization: buildServiceAuthorization(ctx),
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        ...forwarded(ctx, opts),
      }),
  },
  ...logoutRoutes,
  {
    method: "DELETE",
    path: "/users/delete",
    run: (ctx, opts) =>
      deleteAccountHandler({
        authServerUrl: opts.authServerUrl,
        accessCookieName: opts.accessCookieName,
        registrationCookieName: opts.registrationCookieName,
        refreshCookieName: opts.refreshCookieName,
        authorization: buildServiceAuthorization(ctx),
        serviceAuthorization: buildProxyServiceAuthorization(opts),
        ...forwarded(ctx, opts),
      }),
  },
];
