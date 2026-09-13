import type { SeamlessAuthUser } from "@seamless-auth/types";

import { resolveCookieSameSite, type CookieSameSite } from "./applyResult.js";
import { hasScopedRole } from "@seamless-auth/types/role/matching";
import { assertSecretStrength } from "./validateSecrets.js";
import { extractBearerToken, verifyAccessToken } from "./verifyAccessToken.js";
import { verifyCookieJwt } from "./verifyCookieJwt.js";

/**
 * The session a verified access cookie describes: the access token's claims as
 * a resource server reads them off a request. Distinct from `MeUser`, which is
 * the hydrated profile fetched from the auth API.
 *
 * A type-only re-export, so it costs nothing at runtime: the import is erased at
 * compile time and neither zod nor the schema barrel enters the module graph.
 */
export type { SeamlessAuthUser } from "@seamless-auth/types";

/**
 * A guard's decision to refuse a request. Adapters render it as
 * `{ error: errorCode, ...detail }` and log `warn` when it is set.
 */
export interface GuardRejection {
  status: number;
  errorCode: string;
  detail?: Record<string, unknown>;
  warn?: string;
}

// GET/HEAD are read-only and OPTIONS is the CORS preflight, so none can carry a
// state change worth gating.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface OriginCheckInput {
  method: string;
  /** `Sec-Fetch-Site`, already reduced to a single value. */
  secFetchSite?: string;
  /** `Origin`, already reduced to a single value. */
  origin?: string;
  cookieSecure?: boolean;
  cookieSameSite?: CookieSameSite;
  allowedOrigins?: string[];
}

function normalizeOrigin(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Decides whether a cross-site state-changing request should be refused.
 *
 * Only matters when the adapter issues `SameSite=None` cookies, which the
 * browser would otherwise attach to a forged cross-site request. A `Lax` or
 * `Strict` cookie is not sent on one, so the check is inert there.
 *
 * `Sec-Fetch-Site` is the primary signal: current browsers send it and page
 * JavaScript cannot forge it. When it is absent the `Origin` is matched against
 * `allowedOrigins`, but only when the adopter opted in, so nothing regresses for
 * callers that predate the guard.
 */
export function checkOrigin(
  input: OriginCheckInput,
): GuardRejection | undefined {
  const active = resolveCookieSameSite(input) === "none";

  if (!active || SAFE_METHODS.has(input.method)) {
    return undefined;
  }

  const rejection: GuardRejection = {
    status: 403,
    errorCode: "cross_site_request_blocked",
  };

  if (input.secFetchSite !== undefined) {
    return input.secFetchSite.toLowerCase() === "cross-site"
      ? rejection
      : undefined;
  }

  // No `Origin` and no `Sec-Fetch-Site` is a same-origin or non-browser
  // server-to-server caller.
  if (input.origin === undefined) {
    return undefined;
  }

  // A literal `null` origin is opaque or sandboxed, which is cross-site
  // regardless of the allowlist.
  if (input.origin === "null") {
    return rejection;
  }

  // Older browser, but the adopter has not opted into an allowlist. Preserve the
  // pre-guard behavior rather than start rejecting these.
  if (!input.allowedOrigins) {
    return undefined;
  }

  const allowed = new Set(
    input.allowedOrigins.map(normalizeOrigin).filter(Boolean),
  );

  return allowed.has(normalizeOrigin(input.origin)) ? undefined : rejection;
}

export interface CookieAuthInput {
  /** The raw access cookie, or `undefined` when the request carried none. */
  token?: string;
  cookieSecret: string;
}

export type CookieAuthResult =
  | { user: SeamlessAuthUser; rejection?: undefined }
  | { user?: undefined; rejection: GuardRejection };

/**
 * Verifies an access cookie into a session.
 *
 * Does not refresh: silent refresh belongs to `ensureCookies`, mounted on the
 * auth router. A guard on an adopter's own route only reads what is already
 * there.
 */
export function authenticateCookie(input: CookieAuthInput): CookieAuthResult {
  assertSecretStrength("requireAuth: cookieSecret", input.cookieSecret);

  if (!input.token) {
    return {
      rejection: {
        status: 401,
        errorCode: "Failed to find authentication token required",
        warn: "Missing expected auth cookie.",
      },
    };
  }

  const payload = verifyCookieJwt(input.token, input.cookieSecret);

  if (!payload || !payload.sub) {
    return {
      rejection: { status: 401, errorCode: "Invalid or expired session" },
    };
  }

  return {
    user: {
      id: payload.sub,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
      email: payload.email,
      phone: payload.phone,
      iat: payload.iat,
      exp: payload.exp,
      token: payload.token,
    },
  };
}

export interface BearerAuthInput {
  /** The raw `Authorization` header, or `undefined` when the request carried none. */
  authorization?: string;
  authServerUrl: string;
  /** Expected `aud` on the access token. The issuer is `authServerUrl`. */
  audience: string;
}

export type AuthResult = CookieAuthResult;

function missingTokenRejection(warn: string): GuardRejection {
  return {
    status: 401,
    errorCode: "Failed to find authentication token required",
    warn,
  };
}

/**
 * Verifies an access token the auth API issued, carried as `Authorization:
 * Bearer`, into a session.
 *
 * This is the path a native client takes: it has no cookie jar, so it holds the
 * API's own access token and presents it directly. The token carries `sub`,
 * `roles` and the session id but not the profile, so `email` and `phone` are
 * left unset; `getSeamlessUser` hydrates them.
 */
export async function authenticateBearer(
  input: BearerAuthInput,
): Promise<AuthResult> {
  const token = extractBearerToken(input.authorization);

  if (!token) {
    return {
      rejection: missingTokenRejection(
        "Missing expected Authorization bearer token.",
      ),
    };
  }

  const claims = await verifyAccessToken(
    token,
    input.authServerUrl,
    input.audience,
  );

  if (!claims) {
    return {
      rejection: { status: 401, errorCode: "Invalid or expired session" },
    };
  }

  return {
    user: {
      id: claims.sub,
      roles: Array.isArray(claims.roles) ? claims.roles : [],
      iat: claims.iat,
      exp: claims.exp,
      token,
    },
  };
}

export interface RequestAuthInput extends CookieAuthInput {
  /** The raw `Authorization` header, or `undefined` when the request carried none. */
  authorization?: string;
  /**
   * Enables bearer tokens. Left out, the guard accepts cookies only, which is
   * what every adopter predating this option gets.
   */
  bearer?: { authServerUrl: string; audience: string };
}

/**
 * Authenticates a request from whichever credential it carries.
 *
 * The cookie wins when present, including when it is invalid: a browser with a
 * stale cookie should see the session rejected rather than fall through to a
 * header it never meant to send. Bearer is only consulted when there is no
 * cookie at all and the adopter has opted in.
 */
export async function authenticateRequest(
  input: RequestAuthInput,
): Promise<AuthResult> {
  if (input.token || !input.bearer) {
    return authenticateCookie(input);
  }

  assertSecretStrength("requireAuth: cookieSecret", input.cookieSecret);

  if (!extractBearerToken(input.authorization)) {
    return {
      rejection: missingTokenRejection(
        "Missing expected auth cookie or Authorization bearer token.",
      ),
    };
  }

  return authenticateBearer({
    authorization: input.authorization,
    ...input.bearer,
  });
}

/**
 * Authorization only, against a session a guard has already authenticated.
 *
 * Any one of the required roles is enough. Scoped names are understood: a broad
 * `admin` grants everything under it, and a `:write` role grants the matching
 * `:read`.
 */
export function authorizeRoles(
  user: SeamlessAuthUser | undefined,
  requiredRoles: string | string[],
): GuardRejection | undefined {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  if (!user) {
    return { status: 401, errorCode: "Authentication required" };
  }

  if (!Array.isArray(user.roles)) {
    return { status: 403, errorCode: "User has no roles assigned" };
  }

  if (!hasScopedRole(user.roles, roles)) {
    return {
      status: 403,
      errorCode: "Insufficient role",
      detail: { required: roles, actual: user.roles },
    };
  }

  return undefined;
}
