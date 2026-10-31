import {
  createResourceServer as createCoreResourceServer,
  type GuardRejection,
  type ResourceServer,
  type ResourceServerOptions,
  type ResourceServerUser,
  type StepUpRequirement,
} from "@seamless-auth/core";

/** What a route requires beyond a valid token. Checked in this order. */
export interface ResourceServerRequirements {
  /** Every one of the scopes. */
  scopes?: string | string[];
  /** Any one of the roles, with scoped role matching. */
  roles?: string | string[];
  /** Answers the RFC 9470 `insufficient_user_authentication` challenge when unmet. */
  stepUp?: StepUpRequirement;
}

export type ResourceServerResult =
  | { user: ResourceServerUser; response?: undefined }
  | { user?: undefined; response: Response };

export type ResourceServerRouteHandler<Context> = (
  request: Request,
  context: Context,
  user: ResourceServerUser,
) => Response | Promise<Response>;

export interface NextResourceServer {
  /** The verified user, or the `Response` to return instead. */
  authenticate(
    request: Request,
    requirements?: ResourceServerRequirements,
  ): Promise<ResourceServerResult>;
  /** Wraps a route handler so it only runs for a token that meets `requirements`. */
  protect<Context = unknown>(
    handler: ResourceServerRouteHandler<Context>,
    requirements?: ResourceServerRequirements,
  ): (request: Request, context: Context) => Promise<Response>;
  /** The underlying verifier, for checks outside a route. */
  verifier: ResourceServer;
}

function toResponse(rejection: GuardRejection): Response {
  return Response.json(
    { error: rejection.errorCode, ...rejection.detail },
    { status: rejection.status, headers: rejection.headers },
  );
}

/**
 * Verify-only checks for route handlers that receive the OpenID Provider's
 * access tokens. It needs only the issuer and this API's audience: no cookie
 * secret, service secret or auth route handler.
 *
 * ### Example
 * ```ts
 * // app/api/orders/route.ts
 * const api = createResourceServer({
 *   issuer: process.env.OIDC_ISSUER!,
 *   audience: "https://api.example.com",
 * });
 *
 * export const POST = api.protect(
 *   async (request, _context, user) => Response.json(await createOrder(user)),
 *   { scopes: "orders:write" },
 * );
 * ```
 */
export function createResourceServer(
  opts: ResourceServerOptions,
): NextResourceServer {
  const verifier = createCoreResourceServer(opts);
  const stepUps = new WeakMap<
    StepUpRequirement,
    ReturnType<ResourceServer["stepUp"]>
  >();

  function stepUpCheck(requirement: StepUpRequirement) {
    let check = stepUps.get(requirement);
    if (!check) {
      check = verifier.stepUp(requirement);
      stepUps.set(requirement, check);
    }
    return check;
  }

  async function authenticate(
    request: Request,
    requirements: ResourceServerRequirements = {},
  ): Promise<ResourceServerResult> {
    const { user, rejection } = await verifier.authenticate(
      request.headers.get("authorization") ?? undefined,
    );
    if (rejection) return { response: toResponse(rejection) };

    const refused =
      (requirements.scopes !== undefined &&
        verifier.authorizeScopes(user, requirements.scopes)) ||
      (requirements.roles !== undefined &&
        verifier.authorizeRoles(user, requirements.roles)) ||
      (requirements.stepUp !== undefined &&
        stepUpCheck(requirements.stepUp)(user));

    return refused ? { response: toResponse(refused) } : { user };
  }

  return {
    verifier,
    authenticate,
    protect(handler, requirements) {
      // A requirement that asks for nothing should fail at module load, not on
      // the first request.
      if (requirements?.stepUp) stepUpCheck(requirements.stepUp);

      return async (request, context) => {
        const result = await authenticate(request, requirements);
        return result.response ?? handler(request, context, result.user);
      };
    },
  };
}
