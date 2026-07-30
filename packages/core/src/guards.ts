import { resolveCookieSameSite, type CookieSameSite } from "./applyResult.js";
import { hasScopedRole } from "@seamless-auth/types/role/matching";
import { assertSecretStrength } from "./validateSecrets.js";
import { verifyCookieJwt } from "./verifyCookieJwt.js";

/**
 * The session a verified access cookie describes. Distinct from `SeamlessUser`,
 * which is the hydrated profile fetched from the auth API: this one is only
 * what the cookie itself carries.
 */
export interface SeamlessAuthUser {
  id: string;
  roles: string[];
  email?: string;
  phone?: string | null;
  iat?: number;
  exp?: number;
  token?: string;
}

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
