import type {
  CookieSameSite,
  SeamlessAuthMessagingOptions,
} from "@seamless-auth/core";

/**
 * Picks the client address to forward to the auth API, which uses it for rate
 * limiting and audit. Return `undefined` to forward none.
 */
export type ClientIpResolver = (request: Request) => string | undefined;

export type SeamlessAuthHandlerOptions = {
  authServerUrl: string;
  cookieSecret: string;
  serviceSecret: string;
  audience: string;
  /**
   * Expected `iss` on the tokens and signed responses the auth server returns.
   * Defaults to `authServerUrl`. Set it when this server reaches the auth
   * server at a different URL from the one the auth server advertises as its
   * issuer (its `ISSUER` setting), for example a host-run app calling
   * `http://localhost:5312` while the Docker stack's auth server signs as
   * `http://auth:5312`. Requests still go to `authServerUrl`.
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
  /**
   * A route handler has no trusted source for the client address: any caller
   * can set `X-Forwarded-For`. Nothing is forwarded unless this is given, so
   * read the header your platform sets and a client cannot (for example
   * `x-real-ip` on Vercel).
   */
  resolveClientIp?: ClientIpResolver;
  /**
   * Where the catch-all route is mounted. The auth route table is relative to
   * it. Defaults to `/auth`, which is what the client SDKs call.
   */
  basePath?: string;
};

export type ResolvedOptions = SeamlessAuthHandlerOptions & {
  jwksKid: string;
  cookieDomain: string;
  accessCookieName: string;
  registrationCookieName: string;
  refreshCookieName: string;
  preAuthCookieName: string;
  basePath: string;
};
