import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createResourceServer as createCoreResourceServer,
  type GuardRejection,
  type ResourceServer,
  type ResourceServerOptions,
  type ResourceServerUser,
  type StepUpRequirement,
} from "@seamless-auth/core";

type PreHandler = (
  req: FastifyRequest,
  reply: FastifyReply,
) => Promise<unknown>;

export interface FastifyResourceServer {
  /** Verifies `Authorization: Bearer` and sets `request.user`. Run before the other guards. */
  requireAuth(): PreHandler;
  /** Every one of the scopes. */
  requireScope(scopes: string | string[]): PreHandler;
  /** Any one of the roles. Scoped names match as in `requireRole`. */
  requireRole(roles: string | string[]): PreHandler;
  /** Answers the RFC 9470 `insufficient_user_authentication` challenge when unmet. */
  requireStepUp(requirement: StepUpRequirement): PreHandler;
  /** The underlying verifier, for checks outside a route. */
  verifier: ResourceServer;
}

function reject(reply: FastifyReply, rejection: GuardRejection) {
  return reply
    .headers(rejection.headers ?? {})
    .status(rejection.status)
    .send({ error: rejection.errorCode, ...rejection.detail });
}

/**
 * Verify-only `preHandler`s for an API that receives the OpenID Provider's
 * access tokens. It needs only the issuer and this API's audience: no cookie
 * secret, service secret or plugin registration.
 *
 * ### Example
 * ```ts
 * const api = createResourceServer({
 *   issuer: "https://login.example.com",
 *   audience: "https://api.example.com",
 * });
 *
 * app.post("/orders", {
 *   preHandler: [api.requireAuth(), api.requireScope("orders:write")],
 * }, createOrder);
 * ```
 */
export function createResourceServer(
  opts: ResourceServerOptions,
): FastifyResourceServer {
  const verifier = createCoreResourceServer(opts);
  // Guards trust only users this resource server verified, never a
  // `request.user` another hook (a cookie guard, say) set.
  const verified = new WeakMap<FastifyRequest, ResourceServerUser>();

  function guard(
    check: (user: ResourceServerUser | undefined) => GuardRejection | undefined,
  ) {
    return async function resourceServerGuard(
      req: FastifyRequest,
      reply: FastifyReply,
    ) {
      const rejection = check(verified.get(req));
      if (rejection) return reject(reply, rejection);
    };
  }

  return {
    verifier,
    requireAuth() {
      return async function resourceServerAuth(
        req: FastifyRequest,
        reply: FastifyReply,
      ) {
        const { user, rejection } = await verifier.authenticate(
          req.headers.authorization,
        );
        if (rejection) return reject(reply, rejection);

        verified.set(req, user);
        req.user = user;
      };
    },
    requireScope: (scopes) => guard(verifier.scopes(scopes)),
    requireRole: (roles) => guard(verifier.roles(roles)),
    requireStepUp: (requirement) => guard(verifier.stepUp(requirement)),
  };
}
