import type { SeamlessAuthUser } from "@seamless-auth/core";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the plugin's cookie hook once a session cookie has been verified. */
    cookiePayload?: Record<string, any>;
    /** Set by `requireAuth`. */
    user?: SeamlessAuthUser;
  }
}

export {};
