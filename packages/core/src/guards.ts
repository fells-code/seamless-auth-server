import type { SeamlessAuthUser } from "@seamless-auth/types";
import { decodeJwt } from "jose";

import type { CookieSameSite } from "./applyResult.js";
import { hasScopedRole } from "@seamless-auth/types/role/matching";
import type { AuthServerIssuerOption } from "./authServerIssuer.js";
import {
  permissionClaimsOf,
  readTokenClaims,
  rememberAuthServer,
  type UserPermissionClaims,
} from "./permissions.js";
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

/** What every first-party guard answers for a missing, invalid or pre-auth credential. */
export const UNAUTHENTICATED = "unauthenticated";

/** What a role guard answers for a session that holds none of the required roles. */
export const INSUFFICIENT_ROLE = "insufficient_role";

/**
 * A guard's decision to refuse a request. Adapters render it as
 * `{ error: errorCode, ...detail }` and log `warn` when it is set.
 */
export interface GuardRejection {
  status: number;
  errorCode: string;
  detail?: Record<string, unknown>;
  /** Response headers, such as a `WWW-Authenticate` challenge. */
  headers?: Record<string, string>;
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
  /**
   * No longer consulted. The check runs whatever the cookie policy, because a
   * `Lax` or `Strict` cookie still rides a same-site request. Kept so existing
   * callers compile.
   */
  cookieSecure?: boolean;
  /** As `cookieSecure`. */
  cookieSameSite?: CookieSameSite;
  /** Set, even to `[]`, it is enforced for same-site and metadata-free requests. */
  allowedOrigins?: string[];
}

function normalizeOrigin(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Decides whether a cross-site state-changing request should be refused.
 *
 * Runs whatever the adapter's `SameSite` setting: `Lax` and `Strict` keep a
 * cookie off a cross-site request but not off a same-site one, and a sibling
 * subdomain is same-site.
 *
 * A literal `null` `Origin` is refused first, in every case.
 *
 * `Sec-Fetch-Site` is the primary signal: current browsers send it and page
 * JavaScript cannot forge it. `cross-site` is refused and `same-origin` passes.
 * `same-site` also covers a sibling subdomain, so when the adopter configured
 * `allowedOrigins` the `Origin` must be on it as well. When `Sec-Fetch-Site` is
 * absent the `Origin` is matched against `allowedOrigins`, again only when the
 * adopter configured it. Without the list both pass here, and
 * `checkContentType` is what keeps a forged form post out.
 */
export function checkOrigin(
  input: OriginCheckInput,
): GuardRejection | undefined {
  if (SAFE_METHODS.has(input.method)) {
    return undefined;
  }

  const rejection: GuardRejection = {
    status: 403,
    errorCode: "cross_site_request_blocked",
  };

  // A literal `null` origin is opaque or sandboxed, never the adopter's own
  // page, so it is refused whatever `Sec-Fetch-Site` and the allowlist say.
  if (input.origin?.trim().toLowerCase() === "null") {
    return rejection;
  }

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

  if (!input.allowedOrigins) {
    return undefined;
  }

  return isAllowedOrigin(input.origin, input.allowedOrigins)
    ? undefined
    : rejection;
}

export interface ContentTypeCheckInput {
  method: string;
  /** Relative to the adapter's mount point, as the route tables name it. */
  path: string;
  /** `Content-Type`, already reduced to a single value. */
  contentType?: string;
  /** `x-seamless-auth-transport`, already reduced to a single value. */
  transport?: string;
}

// The browser client up to now sends these with no body and no header, so
// they stay open until a client that declares JSON on them is the floor. They
// still get the origin check.
const CONTENT_TYPE_EXEMPT = new Set([
  "POST /refresh",
  "DELETE /logout",
  "DELETE /logout/all",
]);

function routeKey(method: string, path: string): string {
  const normalized = path.toLowerCase().replace(/\/+$/, "") || "/";
  return `${method.toUpperCase()} ${normalized}`;
}

/**
 * Refuses a state-changing request to the adapter's auth routes that declares
 * neither `Content-Type: application/json` nor an `x-seamless-auth-transport`
 * header (any value). An HTML form can only send urlencoded, multipart or plain
 * text, and a `no-cors` fetch can set neither, so requiring one forces a CORS
 * preflight the adopter's CORS policy then decides.
 *
 * Applies even to a request with no body, because the routes act on the cookie
 * alone. Not for an adopter's own routes behind a guard: those get the origin
 * check only.
 */
export function checkContentType(
  input: ContentTypeCheckInput,
): GuardRejection | undefined {
  const method = input.method.toUpperCase();

  if (SAFE_METHODS.has(method)) {
    return undefined;
  }

  if (CONTENT_TYPE_EXEMPT.has(routeKey(method, input.path))) {
    return undefined;
  }

  if (input.transport !== undefined) {
    return undefined;
  }

  const mediaType = input.contentType?.split(";")[0]?.trim().toLowerCase();

  return mediaType === "application/json"
    ? undefined
    : { status: 415, errorCode: "unsupported_media_type" };
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  const allowed = new Set(allowedOrigins.map(normalizeOrigin).filter(Boolean));

  return allowed.has(normalizeOrigin(origin));
}

export interface CookieAuthInput {
  /** The raw access cookie, or `undefined` when the request carried none. */
  token?: string;
  cookieSecret: string;
  /**
   * Accept a recovery session: one issued by account recovery or a recovery code,
   * which can only enroll a new passkey or authenticator app until it does. Off by
   * default, so a half-recovered account is not treated as signed in. Turn it on only
   * for the routes that drive that enrollment.
   */
  allowRecoverySession?: boolean;
}

const RECOVERY_SESSION_REJECTION: GuardRejection = {
  status: 403,
  errorCode: "enrollment_required",
};

function isRecoveryToken(token: unknown): boolean {
  if (typeof token !== "string") return false;

  try {
    return decodeJwt(token).recovery === true;
  } catch {
    return false;
  }
}

/**
 * A session as a guard hands it on. `organizationId` is the verified access
 * token's `org_id`, so it is only set on a path that checked that token against
 * the auth API's key set (bearer, or a cookie with bearer verification on).
 */
export type GuardUser = SeamlessAuthUser &
  UserPermissionClaims & { organizationId?: string };

function organizationOf(claims: { org_id?: unknown }) {
  return typeof claims.org_id === "string" && claims.org_id
    ? { organizationId: claims.org_id }
    : {};
}

export type CookieAuthResult =
  | { user: GuardUser; rejection?: undefined }
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
        errorCode: UNAUTHENTICATED,
        warn: "Missing expected auth cookie.",
      },
    };
  }

  const payload = verifyCookieJwt(input.token, input.cookieSecret);

  if (!payload || !payload.sub || !holdsAccessToken(payload.token)) {
    return {
      rejection: { status: 401, errorCode: UNAUTHENTICATED },
    };
  }

  if (!input.allowRecoverySession && isRecoveryToken(payload.token)) {
    return { rejection: RECOVERY_SESSION_REJECTION };
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
      // Read from the token inside the cookie, not copied into the cookie, which
      // has a 4 KiB limit and already holds the token.
      ...permissionClaimsOf(readTokenClaims(payload.token)),
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
  /** As on `CookieAuthInput`. */
  allowRecoverySession?: boolean;
}

export type AuthResult = CookieAuthResult;

function missingTokenRejection(warn: string): GuardRejection {
  return {
    status: 401,
    errorCode: UNAUTHENTICATED,
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
      rejection: { status: 401, errorCode: UNAUTHENTICATED },
    };
  }

  if (!input.allowRecoverySession && claims.recovery === true) {
    return { rejection: RECOVERY_SESSION_REJECTION };
  }

  return {
    user: rememberAuthServer<GuardUser>(
      {
        id: claims.sub,
        roles: Array.isArray(claims.roles) ? claims.roles : [],
        iat: claims.iat,
        exp: claims.exp,
        token,
        ...organizationOf(claims),
        ...permissionClaimsOf(claims),
      },
      input.authServerUrl,
    ),
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
    allowRecoverySession: input.allowRecoverySession,
    ...input.bearer,
  });
}

// The cookie secret alone can sign a cookie. Holding the inner token to the
// auth API's key set means a forged cookie cannot carry claims of its own.
async function verifyCookieAccessToken(
  user: GuardUser,
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
      rejection: { status: 401, errorCode: UNAUTHENTICATED },
    };
  }

  return {
    user: rememberAuthServer<GuardUser>(
      {
        ...user,
        roles: Array.isArray(claims.roles) ? claims.roles : user.roles,
        ...organizationOf(claims),
      },
      verify.authServerUrl,
    ),
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
    return { status: 401, errorCode: UNAUTHENTICATED };
  }

  if (!Array.isArray(user.roles)) {
    return { status: 403, errorCode: INSUFFICIENT_ROLE };
  }

  // The body names neither the user's roles nor the required ones: the client
  // gains nothing from them, and they map out the app's authorization model.
  if (!hasScopedRole(user.roles, roles)) {
    return { status: 403, errorCode: INSUFFICIENT_ROLE };
  }

  return undefined;
}
