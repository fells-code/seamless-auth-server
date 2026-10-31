import type {
  ResourceServerClaims,
  SeamlessAuthUser,
  SessionCookie,
} from "@seamless-auth/core";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the plugin's cookie hook once a session cookie has been verified. */
    cookiePayload?: Record<string, any>;
    /**
     * Set by the plugin's cookie hook. Rotates a recovery session after it enrolls
     * a passkey or authenticator app, answering the cookies to set, if any.
     */
    seamlessRecoveryRefresh?: (
      status: number,
    ) => Promise<SessionCookie[] | undefined>;
    /**
     * Set by `requireAuth`, or by a resource server's `requireAuth`, which also
     * sets the provider claims.
     */
    user?: SeamlessAuthUser & Partial<ResourceServerClaims>;
  }
}

export {};
