import type {
  ResourceServerClaims,
  SeamlessAuthUser,
} from "@seamless-auth/core";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the plugin's cookie hook once a session cookie has been verified. */
    cookiePayload?: Record<string, any>;
    /**
     * Set by `requireAuth`, or by a resource server's `requireAuth`, which also
     * sets the provider claims.
     */
    user?: SeamlessAuthUser & Partial<ResourceServerClaims>;
  }
}

export {};
