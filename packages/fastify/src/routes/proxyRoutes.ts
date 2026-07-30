import type { ProxyIdentity } from "@seamless-auth/core";

export interface ProxyRouteDefinition {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Route path, with the `:params` Fastify binds. */
  path: string;
  /**
   * Upstream path. `:params` here are filled from the route's params and always
   * encoded, so a param cannot escape its own path segment.
   */
  upstream: string;
  identity: ProxyIdentity;
}

/**
 * The passthrough routes, forwarded to the auth API with no interpretation.
 *
 * A table rather than one path builder per route, so the encoding happens in a
 * single place. Hand-writing these is how two of them ended up interpolating a
 * param unencoded in the Express adapter.
 */
export const PROXY_ROUTES: ProxyRouteDefinition[] = [
  {
    method: "POST",
    path: "/webAuthn/login/start",
    upstream: "webAuthn/login/start",
    identity: "preAuth",
  },
  {
    method: "GET",
    path: "/webAuthn/register/start",
    upstream: "webAuthn/register/start",
    identity: "preAuth",
  },

  {
    method: "GET",
    path: "/organizations",
    upstream: "organizations",
    identity: "access",
  },
  {
    method: "POST",
    path: "/organizations",
    upstream: "organizations",
    identity: "access",
  },
  {
    method: "GET",
    path: "/organizations/:organizationId",
    upstream: "organizations/:organizationId",
    identity: "access",
  },
  {
    method: "PATCH",
    path: "/organizations/:organizationId",
    upstream: "organizations/:organizationId",
    identity: "access",
  },
  {
    method: "GET",
    path: "/organizations/:organizationId/members",
    upstream: "organizations/:organizationId/members",
    identity: "access",
  },
  {
    method: "POST",
    path: "/organizations/:organizationId/members",
    upstream: "organizations/:organizationId/members",
    identity: "access",
  },
  {
    method: "PATCH",
    path: "/organizations/:organizationId/members/:userId",
    upstream: "organizations/:organizationId/members/:userId",
    identity: "access",
  },
  {
    method: "DELETE",
    path: "/organizations/:organizationId/members/:userId",
    upstream: "organizations/:organizationId/members/:userId",
    identity: "access",
  },

  {
    method: "GET",
    path: "/step-up/status",
    upstream: "step-up/status",
    identity: "access",
  },
  {
    method: "POST",
    path: "/step-up/webauthn/start",
    upstream: "step-up/webauthn/start",
    identity: "access",
  },
  {
    method: "POST",
    path: "/step-up/webauthn/finish",
    upstream: "step-up/webauthn/finish",
    identity: "access",
  },

  {
    method: "GET",
    path: "/totp/status",
    upstream: "totp/status",
    identity: "access",
  },
  {
    method: "POST",
    path: "/totp/enroll/start",
    upstream: "totp/enroll/start",
    identity: "access",
  },
  {
    method: "POST",
    path: "/totp/enroll/verify",
    upstream: "totp/enroll/verify",
    identity: "access",
  },
  {
    method: "POST",
    path: "/totp/disable",
    upstream: "totp/disable",
    identity: "access",
  },
  {
    method: "POST",
    path: "/totp/verify-mfa",
    upstream: "totp/verify-mfa",
    identity: "access",
  },

  {
    method: "POST",
    path: "/users/update",
    upstream: "users/update",
    identity: "access",
  },
  {
    method: "POST",
    path: "/users/credentials",
    upstream: "users/credentials",
    identity: "access",
  },
  {
    method: "DELETE",
    path: "/users/credentials",
    upstream: "users/credentials",
    identity: "access",
  },

  {
    method: "GET",
    path: "/system-config/oauth-providers",
    upstream: "system-config/oauth-providers",
    identity: "access",
  },
  {
    method: "POST",
    path: "/system-config/oauth-providers",
    upstream: "system-config/oauth-providers",
    identity: "access",
  },
  {
    method: "PATCH",
    path: "/system-config/oauth-providers/:id",
    upstream: "system-config/oauth-providers/:id",
    identity: "access",
  },
  {
    method: "DELETE",
    path: "/system-config/oauth-providers/:id",
    upstream: "system-config/oauth-providers/:id",
    identity: "access",
  },

  {
    method: "GET",
    path: "/admin/organizations",
    upstream: "admin/organizations",
    identity: "access",
  },
  {
    method: "POST",
    path: "/admin/organizations",
    upstream: "admin/organizations",
    identity: "access",
  },
  {
    method: "GET",
    path: "/admin/organizations/:organizationId",
    upstream: "admin/organizations/:organizationId",
    identity: "access",
  },
  {
    method: "PATCH",
    path: "/admin/organizations/:organizationId",
    upstream: "admin/organizations/:organizationId",
    identity: "access",
  },
  {
    method: "GET",
    path: "/admin/organizations/:organizationId/members",
    upstream: "admin/organizations/:organizationId/members",
    identity: "access",
  },
  {
    method: "POST",
    path: "/admin/organizations/:organizationId/members",
    upstream: "admin/organizations/:organizationId/members",
    identity: "access",
  },
  {
    method: "PATCH",
    path: "/admin/organizations/:organizationId/members/:userId",
    upstream: "admin/organizations/:organizationId/members/:userId",
    identity: "access",
  },
  {
    method: "DELETE",
    path: "/admin/organizations/:organizationId/members/:userId",
    upstream: "admin/organizations/:organizationId/members/:userId",
    identity: "access",
  },
];

/**
 * Fills the `:params` in an upstream template from the route's params, encoding
 * each so it stays inside a single path segment.
 */
export function resolveUpstreamPath(
  template: string,
  params: Record<string, unknown>,
): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];

    if (typeof value !== "string" || value === "") {
      throw new Error(`Missing route parameter "${name}"`);
    }

    return encodeURIComponent(value);
  });
}
