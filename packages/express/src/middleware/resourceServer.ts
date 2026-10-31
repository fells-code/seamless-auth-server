import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  createResourceServer as createCoreResourceServer,
  type GuardRejection,
  type ResourceServer,
  type ResourceServerOptions,
  type ResourceServerUser,
  type StepUpRequirement,
} from "@seamless-auth/core";

export interface ExpressResourceServer {
  /** Verifies `Authorization: Bearer` and sets `req.user`. Mount before the other guards. */
  requireAuth(): RequestHandler;
  /** Every one of the scopes. */
  requireScope(scopes: string | string[]): RequestHandler;
  /** Any one of the roles. Scoped names match as in `requireRole`. */
  requireRole(roles: string | string[]): RequestHandler;
  /** Answers the RFC 9470 `insufficient_user_authentication` challenge when unmet. */
  requireStepUp(requirement: StepUpRequirement): RequestHandler;
  /** The underlying verifier, for checks outside a route. */
  verifier: ResourceServer;
}

function reject(res: Response, rejection: GuardRejection) {
  for (const [name, value] of Object.entries(rejection.headers ?? {})) {
    res.setHeader(name, value);
  }
  res
    .status(rejection.status)
    .json({ error: rejection.errorCode, ...rejection.detail });
}

/**
 * Verify-only guards for an API that receives the OpenID Provider's access
 * tokens. It needs only the issuer and this API's audience: no cookie secret,
 * service secret or `/auth` routes.
 *
 * ### Example
 * ```ts
 * const api = createResourceServer({
 *   issuer: "https://login.example.com",
 *   audience: "https://api.example.com",
 * });
 *
 * app.post("/orders", api.requireAuth(), api.requireScope("orders:write"), createOrder);
 * app.post(
 *   "/payouts",
 *   api.requireAuth(),
 *   api.requireStepUp({ acrValues: ["phr"], maxAge: 300 }),
 *   createPayout,
 * );
 * ```
 */
export function createResourceServer(
  opts: ResourceServerOptions,
): ExpressResourceServer {
  const verifier = createCoreResourceServer(opts);
  // Guards trust only users this resource server verified, never a `req.user`
  // another middleware (a cookie guard, say) set.
  const verified = new WeakMap<Request, ResourceServerUser>();

  function guard(
    check: (user: ResourceServerUser | undefined) => GuardRejection | undefined,
  ) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const rejection = check(verified.get(req));
      if (rejection) {
        reject(res, rejection);
        return;
      }
      next();
    };
  }

  return {
    verifier,
    requireAuth() {
      return async (req: Request, res: Response, next: NextFunction) => {
        const { user, rejection } = await verifier.authenticate(
          req.headers.authorization,
        );
        if (rejection) {
          reject(res, rejection);
          return;
        }
        verified.set(req, user);
        req.user = user;
        next();
      };
    },
    requireScope: (scopes) =>
      guard((user) => verifier.authorizeScopes(user, scopes)),
    requireRole: (roles) =>
      guard((user) => verifier.authorizeRoles(user, roles)),
    requireStepUp: (requirement) => guard(verifier.stepUp(requirement)),
  };
}
