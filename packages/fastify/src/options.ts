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
  audience: string;
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
