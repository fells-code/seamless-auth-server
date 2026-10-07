import type {
  CookieSameSite,
  SeamlessAuthMessagingOptions,
  SeamlessAuthUser,
} from "@seamless-auth/core";

import type { ClientIpResolver } from "./internal/buildForwardedClientIp";

export type SeamlessAuthServerOptions = {
  authServerUrl: string;
  cookieSecret: string;
  serviceSecret: string;
  /**
   * Expected `aud` on the auth server's tokens and signed responses. The auth
   * API sets `aud` to its ISSUER, so this is normally `authServerUrl`, or the
   * same value as `authServerIssuer` when that is set.
   */
  audience: string;
  /**
   * Expected `iss` on the tokens and signed responses the auth server returns.
   * Defaults to `authServerUrl`. Set it when this server reaches the auth
   * server at a different URL from the one the auth server advertises as its
   * issuer (its `ISSUER` setting), for example a host-run app calling
   * `http://localhost:5312` while the Docker stack's auth server signs as
   * `http://auth:5312`. Requests still go to `authServerUrl`. The auth API
   * also sets `aud` to its ISSUER, so set `audience` to the same value.
   */
  authServerIssuer?: string;
  jwksKid?: string;
  cookieDomain?: string;
  cookieSecure?: boolean;
  cookieSameSite?: CookieSameSite;
  allowedOrigins?: string[];
  accessCookieName?: string;
  registrationCookieName?: string;
  refreshCookieName?: string;
  preAuthCookieName?: string;
  messaging?: SeamlessAuthMessagingOptions;
  resolveClientIp?: ClientIpResolver;
};

export type ResolvedOptions = SeamlessAuthServerOptions & {
  jwksKid: string;
  cookieDomain: string;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  preAuthCookieName: string;
};

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the plugin's cookie hook once a session cookie has been verified. */
    cookiePayload?: Record<string, any>;
    /** Set by `requireAuth`. */
    user?: SeamlessAuthUser;
  }
}
