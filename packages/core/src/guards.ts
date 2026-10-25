import type { SeamlessAuthUser } from "@seamless-auth/types";
import { decodeJwt } from "jose";

import { resolveCookieSameSite, type CookieSameSite } from "./applyResult.js";
import { hasScopedRole } from "@seamless-auth/types/role/matching";
import type { AuthServerIssuerOption } from "./authServerIssuer.js";
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
 * JavaScript cannot forge it. `cross-site` is refused and `same-origin` passes.
 * `same-site` also covers a sibling subdomain, so when the adopter configured
 * `allowedOrigins` the `Origin` must be on it as well; without the allowlist a
 * same-site request passes, as it always has. When `Sec-Fetch-Site` is absent
 * the `Origin` is matched against `allowedOrigins`, again only when the adopter
 * opted in, so nothing regresses for callers that predate the guard.
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
    const site = input.secFetchSite.toLowerCase();

    if (site === "cross-site") {
      return rejection;
    }

    if (site !== "same-site" || !input.allowedOrigins) {
      return undefined;
    }

    return input.origin !== undefined &&
      isAllowedOrigin(input.origin, input.allowedOrigins)
      ? undefined
      : rejection;
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

  return isAllowedOrigin(input.origin, input.allowedOrigins)
    ? undefined
    : rejection;
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  const allowed = new Set(allowedOrigins.map(normalizeOrigin).filter(Boolean));

  return allowed.has(normalizeOrigin(origin));
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
 * Whether a cookie carries an auth API access token.
 *
 * Every adapter cookie is signed with the same secret, including the pre-auth
 * cookie `/login` issues for any existing account from an email address alone.
 * The signature only proves this adapter wrote the cookie, not which cookie it
 * is, so a session also needs an access token inside it. The token was verified
 * against the auth API's key set before the adapter signed it into the cookie,
 * so its claims are read here without verifying it again.
 */
export function holdsAccessToken(token: unknown): boolean {
  if (typeof token !== "string") return false;

  try {
    return decodeJwt(token).typ === "access";
  } catch {
    return false;
  }
}

/**
 * Verifies an access cookie into a session.
 *
 * Does not refresh: silent refresh belongs to `ensureCookies`, mounted on the
 * auth router. A guard on an adopter's own route only reads what is already
 * there.
 */
export function authenticateCookie(input: CookieAuthInput): CookieAuthResult {
  assertSecretStrength("requireAuth: cookieSecret", input.cookieSecret, {
    allowPlaceholder: true,
  });

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

  if (!payload || !payload.sub || !holdsAccessToken(payload.token)) {
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

export interface BearerAuthInput extends AuthServerIssuerOption {
  /** The raw `Authorization` header, or `undefined` when the request carried none. */
  authorization?: string;
  authServerUrl: string;
  /**
   * Expected `aud` on the access token. The expected issuer is
   * `authServerIssuer`, which defaults to `authServerUrl`.
   */
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
    input.authServerIssuer,
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
  bearer?: {
    authServerUrl: string;
    audience: string;
    authServerIssuer?: string;
  };
}

/**
 * Authenticates a request from whichever credential it carries.
 *
 * The cookie wins when present, including when it is invalid: a browser with a
 * stale cookie should see the session rejected rather than fall through to a
 * header it never meant to send. Bearer is only consulted when there is no
 * cookie at all and the adopter has opted in.
 *
 * With `bearer` configured, a cookie's inner access token is also verified
 * against the auth API's key set, and its roles come from that token.
 */
export async function authenticateRequest(
  input: RequestAuthInput,
): Promise<AuthResult> {
  if (input.token || !input.bearer) {
    const result = authenticateCookie(input);

    return result.user && input.bearer
      ? verifyCookieAccessToken(result.user, input.bearer)
      : result;
  }

  assertSecretStrength("requireAuth: cookieSecret", input.cookieSecret, {
    allowPlaceholder: true,
  });

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

// The cookie secret alone can sign a cookie. Holding the inner token to the
// auth API's key set means a forged cookie cannot carry claims of its own.
async function verifyCookieAccessToken(
  user: SeamlessAuthUser,
  verify: NonNullable<RequestAuthInput["bearer"]>,
): Promise<AuthResult> {
  const claims = await verifyAccessToken(
    user.token as string,
    verify.authServerUrl,
    verify.audience,
    verify.authServerIssuer,
  );

  if (!claims || claims.sub !== user.id) {
    return {
      rejection: { status: 401, errorCode: "Invalid or expired session" },
    };
  }

  return {
    user: {
      ...user,
      roles: Array.isArray(claims.roles) ? claims.roles : user.roles,
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
