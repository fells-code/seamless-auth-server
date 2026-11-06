import type { SeamlessAuthUser } from "@seamless-auth/types";
import {
  hasAllPermissions,
  hasPermission,
} from "@seamless-auth/types/permission/matching";
import { decodeJwt } from "jose";

import { authFetch } from "./authFetch.js";
import type { GuardRejection } from "./guards.js";

/** What a permission guard answers when the requirement is not met. */
export const INSUFFICIENT_PERMISSION = "insufficient_permission";

/** What a permission guard answers when it had to ask the auth API and could not get an answer. */
export const PERMISSIONS_UNAVAILABLE = "permissions_unavailable";

/**
 * The authorization claims of an access token, in the adapters' naming. Absent
 * until a token was read. Empty with `permissionsOmitted` means "ask the auth
 * API", not "none".
 */
export interface UserPermissionClaims {
  permissions?: string[];
  organizationRoles?: string[];
  organizationPermissions?: string[];
  /** The token's claims did not fit, so `permissions`, `organizationRoles` and `organizationPermissions` say nothing. */
  permissionsOmitted?: boolean;
}

export type PermissionMatch = "any" | "all";

/** The options a framework's `requirePermission` takes, whatever the framework. */
export interface PermissionGuardOptions {
  /** `any` (the default) needs one of the permissions, `all` needs every one. */
  match?: PermissionMatch;
  /**
   * Count only the active organization's permissions, and refuse a token with no
   * active organization. This alone lets a token for organization A through on
   * `/orgs/B/...`: for a route that names an organization use `organizationParam`.
   */
  organization?: boolean;
  /**
   * The route parameter naming the organization. Implies `organization`, and the
   * parameter must equal the active organization exactly. A missing parameter is
   * a 403.
   */
  organizationParam?: string;
}

export interface PermissionRequirement {
  match?: PermissionMatch;
  /** `{ routeValue }` binds the check to the organization a route names. */
  organization?: boolean | { routeValue: string | undefined };
}

interface HeldPermissions {
  permissions?: unknown;
  organizationPermissions?: unknown;
  organizationId?: unknown;
}

const INSUFFICIENT: GuardRejection = {
  status: 403,
  errorCode: INSUFFICIENT_PERMISSION,
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** Reads a token's authorization claims. Malformed ones read as empty and never fail. */
export function permissionClaimsOf(
  claims: Record<string, unknown>,
): Required<UserPermissionClaims> {
  return {
    permissions: strings(claims.permissions),
    organizationRoles: strings(claims.org_roles),
    organizationPermissions: strings(claims.org_permissions),
    permissionsOmitted: claims.permissions_omitted === true,
  };
}

/** The claims of a token that has already been verified, or none. */
export function readTokenClaims(token: unknown): Record<string, unknown> {
  if (typeof token !== "string") return {};

  try {
    return decodeJwt(token);
  } catch {
    return {};
  }
}

/** Turns a guard's options and its route's parameters into the requirement to check. */
export function permissionRequirement(
  { match, organization, organizationParam }: PermissionGuardOptions,
  params: unknown,
): PermissionRequirement {
  if (organizationParam === undefined) return { match, organization };

  const value = (params as Record<string, unknown> | null | undefined)?.[
    organizationParam
  ];

  return {
    match,
    organization: { routeValue: typeof value === "string" ? value : undefined },
  };
}

/**
 * Exact, case-sensitive matching: no wildcards and no implied grants, unlike a
 * role. An empty required list holds in no mode, because `hasPermission` and
 * `hasAllPermissions` both refuse it.
 */
export function meetsPermissionRequirement(
  held: HeldPermissions,
  required: string | string[],
  { match = "any", organization }: PermissionRequirement,
): boolean {
  if (organization) {
    if (typeof held.organizationId !== "string" || !held.organizationId) {
      return false;
    }

    if (
      typeof organization === "object" &&
      organization.routeValue !== held.organizationId
    ) {
      return false;
    }
  }

  const granted = organization
    ? strings(held.organizationPermissions)
    : [
        ...strings(held.permissions),
        ...strings(held.organizationPermissions),
      ];

  if (match === "all") return hasAllPermissions(granted, required);
  // A JavaScript caller's typo must not quietly weaken `all` to `any`.
  return match === "any" && hasPermission(granted, required);
}

// The URL a user's token was verified against, so a guard behind a `requireAuth`
// with bearer verification needs no configuration of its own. Keyed by the object
// rather than held on it, so no claim or cookie field can supply the URL.
const verifiedAgainst = new WeakMap<object, string>();

export function rememberAuthServer<User extends object>(
  user: User,
  authServerUrl: string,
): User {
  verifiedAgainst.set(user, authServerUrl);
  return user;
}

function unavailable(warn: string): GuardRejection {
  return { status: 503, errorCode: PERMISSIONS_UNAVAILABLE, warn };
}

async function readLivePermissions(
  token: string,
  authServerUrl: string,
): Promise<{ held: HeldPermissions } | { rejection: GuardRejection }> {
  try {
    // authFetch applies the upstream timeout, and answers an unreachable API or
    // a redirect with a 502 rather than throwing or following it.
    const response = await authFetch(`${authServerUrl}/users/me/permissions`, {
      method: "GET",
      authorization: `Bearer ${token}`,
    });

    if (response.status === 401) {
      return { rejection: { status: 401, errorCode: "unauthenticated" } };
    }

    if (!response.ok) {
      return {
        rejection: unavailable(
          `The live permission read answered HTTP ${response.status}.`,
        ),
      };
    }

    const body = (await response.json()) as Record<string, unknown> | undefined;

    if (
      !body ||
      !isStringList(body.permissions) ||
      !isStringList(body.organizationPermissions) ||
      !(body.organizationId === null || typeof body.organizationId === "string")
    ) {
      return {
        rejection: unavailable(
          "The live permission read answered a malformed body.",
        ),
      };
    }

    return { held: body };
  } catch {
    return {
      rejection: unavailable("The live permission read could not be completed."),
    };
  }
}

export interface AuthorizePermissionsOptions extends PermissionRequirement {
  /**
   * Where to read a token that omits its permissions. Defaults to the URL
   * `requireAuth` verified the token against. Never taken from the token.
   */
  authServerUrl?: string;
}

/**
 * Authorization only, against a session a guard has already authenticated. Asks
 * the auth API only when the token says its permissions did not fit, with no
 * caching and no retry, and fails closed when it cannot get an answer.
 *
 * The body of a refusal names no permissions, as with roles.
 */
export async function authorizePermissions(
  user:
    | (SeamlessAuthUser & Pick<UserPermissionClaims, "permissionsOmitted">)
    | undefined,
  required: string | string[],
  options: AuthorizePermissionsOptions = {},
): Promise<GuardRejection | undefined> {
  if (!user) {
    return { status: 401, errorCode: "unauthenticated" };
  }

  const { authServerUrl, ...requirement } = options;
  const list = Array.isArray(required) ? required : [required];
  const unboundRoute =
    typeof requirement.organization === "object" &&
    requirement.organization.routeValue === undefined;

  // Neither can pass whatever the auth API says, so neither is worth asking it.
  if (list.length === 0 || unboundRoute) return INSUFFICIENT;

  let held: HeldPermissions = {
    ...user,
    // A cookie-only guard leaves `organizationId` unset, but the token inside the
    // cookie was verified before it was signed in, as `holdsAccessToken` relies on.
    organizationId:
      user.organizationId ?? readTokenClaims(user.token).org_id,
  };

  if (user.permissionsOmitted === true) {
    const url = authServerUrl ?? verifiedAgainst.get(user);

    if (!url) {
      return unavailable(
        "This token omits its permissions and no auth server URL is configured to read them from. Set authServerUrl and audience on requireAuth, or authServerUrl on requirePermission.",
      );
    }

    if (typeof user.token !== "string") {
      return unavailable(
        "This session omits its permissions and holds no access token to read them with.",
      );
    }

    const live = await readLivePermissions(user.token, url);
    if ("rejection" in live) return live.rejection;
    held = live.held;
  }

  return meetsPermissionRequirement(held, list, requirement)
    ? undefined
    : INSUFFICIENT;
}
