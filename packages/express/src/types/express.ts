import type { SeamlessAuthUser } from "@seamless-auth/core";

// A module rather than an ambient .d.ts: tsc does not copy .d.ts sources into
// dist, so an ambient file never reached consumers.
declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` once the access cookie or bearer token verifies. */
      user?: SeamlessAuthUser;
      /** Set by `createEnsureCookiesMiddleware` once a session cookie verifies. */
      cookiePayload?: Record<string, any>;
    }
  }
}

export {};
