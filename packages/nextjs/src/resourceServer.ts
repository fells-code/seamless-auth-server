import {
  createResourceServer as createCoreResourceServer,
  type GuardRejection,
  type PermissionGuardOptions,
  permissionRequirement,
  type ResourceServer,
  type ResourceServerOptions,
  type ResourceServerUser,
  type StepUpRequirement,
} from "@seamless-auth/core";

/** What a route requires beyond a valid token. Checked in this order. */
export interface ResourceServerRequirements {
  /**
   * Accept a client credentials token (`isClient`). Defaults to `true`. With
   * `false`, such a token is refused with `403 user_required`.
   */
  allowClients?: boolean;
  /** Every one of the scopes. */
  scopes?: string | string[];
  /** Any one of the roles, with scoped role matching. */
  roles?: string | string[];
  /**
   * The rules of the first-party `requirePermission`, shaped by `permissionOptions`.
   * Provider tokens do not carry these claims until seamless-auth-oidc-provider#47,
   * so it denies today.
   */
  permissions?: string | string[];
  permissionOptions?: PermissionGuardOptions;
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
  /**
   * The verified user, or the `Response` to return instead. `context` is the route
   * context, which `permissionOptions.organizationParam` reads.
   */
  authenticate(
    request: Request,
    requirements?: ResourceServerRequirements,
    context?: unknown,
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
    context?: unknown,
  ): Promise<ResourceServerResult> {
    const { user, rejection } = await verifier.authenticate(
      request.headers.get("authorization") ?? undefined,
      { allowClients: requirements.allowClients },
    );
    if (rejection) return { response: toResponse(rejection) };

    const refused =
      (requirements.scopes !== undefined &&
        verifier.authorizeScopes(user, requirements.scopes)) ||
      (requirements.roles !== undefined &&
        verifier.authorizeRoles(user, requirements.roles)) ||
      (requirements.permissions !== undefined &&
        verifier.authorizePermissions(
          user,
          requirements.permissions,
          permissionRequirement(
            requirements.permissionOptions ?? {},
            // `params` is a promise from Next.js 15 and a plain object before it.
            await (context as { params?: unknown } | undefined)?.params,
          ),
        )) ||
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
      if (requirements?.scopes !== undefined)
        verifier.scopes(requirements.scopes);
      if (requirements?.roles !== undefined) verifier.roles(requirements.roles);
      if (requirements?.stepUp) stepUpCheck(requirements.stepUp);

      return async (request, context) => {
        const result = await authenticate(request, requirements, context);
        return result.response ?? handler(request, context, result.user);
      };
    },
  };
}
