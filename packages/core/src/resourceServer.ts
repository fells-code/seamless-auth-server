import type { SeamlessAuthUser } from "@seamless-auth/types";
import { roleGrantsAccess } from "@seamless-auth/types/role/matching";
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  decodeProtectedHeader,
  errors,
  jwtVerify,
} from "jose";
import type { JSONWebKeySet, JWTPayload, JWTVerifyGetKey } from "jose";

import type { GuardRejection } from "./guards.js";
import { extractBearerToken } from "./verifyAccessToken.js";

/**
 * What an OpenID Provider access token says beyond a first-party session. Every
 * field is set on a user the resource server verified, and absent on a cookie
 * session, so adapters can widen `request.user` with `Partial<>` of it.
 */
export interface ResourceServerClaims {
  clientId: string;
  scopes: string[];
  sid?: string;
  orgId?: string;
  acr?: string;
  amr: string[];
  /** Seconds since the epoch. */
  authTime?: number;
}

export type ResourceServerUser = SeamlessAuthUser & ResourceServerClaims;

export interface ResourceServerOptions {
  /** The provider's issuer (`oidc_issuer`), compared to `iss` exactly. */
  issuer: string;
  /** This API's resource identifier, which must be in `aud`. */
  audience: string;
  /** Skips discovery and fetches keys here. */
  jwksUri?: string;
  /** A fixed key set, for tests and deployments that pin keys. Skips discovery. */
  jwks?: JSONWebKeySet;
  /**
   * Accepts a sender-constrained token (`cnf`, RFC 7800), for example by checking
   * a DPoP proof against `cnf.jkt` (RFC 9449). Without it such a token is refused,
   * since a verifier that ignores `cnf` would accept a stolen bound token.
   */
  confirm?: (cnf: unknown, claims: JWTPayload) => boolean | Promise<boolean>;
  /** The clock, for tests. */
  currentDate?: () => Date;
}

export type ResourceServerAuthResult =
  | { user: ResourceServerUser; rejection?: undefined }
  | { user?: undefined; rejection: GuardRejection };

export interface StepUpRequirement {
  /** Any of these `acr` values. `phr` is also met by `phrh`. */
  acrValues?: string[];
  /** Every one of these `amr` values. */
  amr?: string[];
  /** Seconds since `auth_time`. */
  maxAge?: number;
}

export interface ResourceServer {
  /** The verified user, or `null` for any token this resource server must refuse. */
  verify(token: string): Promise<ResourceServerUser | null>;
  /** Verifies the raw `Authorization` header. */
  authenticate(
    authorization: string | undefined,
  ): Promise<ResourceServerAuthResult>;
  /** All of the scopes. */
  authorizeScopes(
    user: ResourceServerUser | undefined,
    scopes: string | string[],
  ): GuardRejection | undefined;
  /** Any one of the roles, with scoped role matching. */
  authorizeRoles(
    user: ResourceServerUser | undefined,
    roles: string | string[],
  ): GuardRejection | undefined;
  /** Builds a step-up check, failing at setup on a requirement that asks for nothing. */
  stepUp(
    requirement: StepUpRequirement,
  ): (user: ResourceServerUser | undefined) => GuardRejection | undefined;
}

type KeySet = JWTVerifyGetKey &
  Partial<
    Pick<ReturnType<typeof createRemoteJWKSet>, "coolingDown" | "reload">
  >;

const CLOCK_SKEW_SECONDS = 5;
const FETCH_TIMEOUT_MS = 5000;
const MAX_DISCOVERY_BYTES = 256 * 1024;
const DISCOVERY_RETRY_MS = 5000;
const ACCESS_TOKEN_TYP = "at+jwt";

const DIFFERENT_LEVEL = "A different authentication level is required";
const MORE_RECENT = "More recent authentication is required";

const MISSING_TOKEN: GuardRejection = {
  status: 401,
  errorCode: "missing_token",
  headers: { "WWW-Authenticate": "Bearer" },
};

const INVALID_TOKEN: GuardRejection = {
  status: 401,
  errorCode: "invalid_token",
  headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
};

function isHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function trimTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end--;
  return value.slice(0, end);
}

async function readCapped(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) throw new Error("discovery document too large");

  const text = await response.text();
  if (text.length > limit) throw new Error("discovery document too large");
  return text;
}

async function discoverJwksUri(issuer: string): Promise<string> {
  const response = await fetch(
    `${trimTrailingSlashes(issuer)}/.well-known/openid-configuration`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (response.status !== 200) {
    throw new Error(`discovery answered ${response.status}`);
  }

  const doc: unknown = JSON.parse(
    await readCapped(response, MAX_DISCOVERY_BYTES),
  );
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("discovery document is not an object");
  }

  const { issuer: advertised, jwks_uri: jwksUri } = doc as Record<
    string,
    unknown
  >;
  if (advertised !== issuer) throw new Error("discovery issuer mismatch");

  const url = typeof jwksUri === "string" ? isHttpUrl(jwksUri) : null;
  if (!url || (issuer.startsWith("https:") && url.protocol !== "https:")) {
    throw new Error("discovery jwks_uri is not usable");
  }
  return url.toString();
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * The claims a token must carry, and the types the optional ones must have,
 * before anything reads them. `null` means refuse.
 */
function toUser(claims: JWTPayload, token: string): ResourceServerUser | null {
  const {
    sub,
    client_id: clientId,
    scope,
    roles,
    sid,
    org_id: orgId,
    acr,
    amr,
  } = claims;
  const authTime = claims.auth_time;

  if (
    typeof sub !== "string" ||
    !sub ||
    typeof clientId !== "string" ||
    !clientId ||
    // A first-party `typ` claim marks a Seamless session or pre-auth token. Provider
    // tokens never carry one (ADR 0001, D11).
    "typ" in claims ||
    !optionalString(scope) ||
    !optionalString(acr) ||
    !optionalString(sid) ||
    !(orgId === undefined || orgId === null || typeof orgId === "string") ||
    !(amr === undefined || stringArray(amr)) ||
    !(roles === undefined || stringArray(roles)) ||
    !(authTime === undefined || typeof authTime === "number")
  ) {
    return null;
  }

  return {
    id: sub,
    clientId,
    scopes: scope ? scope.split(" ").filter(Boolean) : [],
    roles: roles ?? [],
    amr: amr ?? [],
    ...(sid !== undefined && { sid }),
    ...(typeof orgId === "string" && { orgId }),
    ...(acr !== undefined && { acr }),
    ...(authTime !== undefined && { authTime }),
    iat: claims.iat,
    exp: claims.exp,
    token,
  };
}

function quote(value: string) {
  return value.replace(/[\\"]/g, "\\$&");
}

/**
 * A verify-only guard for an API that receives the OpenID Provider's access
 * tokens (RFC 9068) as `Authorization: Bearer`. It needs the issuer and this
 * API's audience, and nothing else: no cookie secret, service secret or auth
 * routes. Keys come from the issuer's discovery document unless `jwksUri` or
 * `jwks` is given.
 *
 * Every adapter (these, Go, Python and Rust) answers the same tokens the same
 * way, which the shared vectors in `tests/fixtures/verify-only` hold them to.
 */
export function createResourceServer(
  opts: ResourceServerOptions,
): ResourceServer {
  const { issuer, audience, confirm } = opts;
  const currentDate = opts.currentDate ?? (() => new Date());

  if (!issuer || !isHttpUrl(issuer)) {
    throw new Error(
      "createResourceServer: issuer must be an absolute http(s) URL",
    );
  }
  // jose skips the claim check for an empty expected value, which would turn a
  // blank audience into "any audience".
  if (!audience) {
    throw new Error("createResourceServer: audience must be non-empty");
  }
  if (opts.jwksUri !== undefined && !isHttpUrl(opts.jwksUri)) {
    throw new Error(
      "createResourceServer: jwksUri must be an absolute http(s) URL",
    );
  }

  let keySet: KeySet | undefined = opts.jwks
    ? createLocalJWKSet(opts.jwks)
    : undefined;
  let discovering: Promise<KeySet | undefined> | undefined;
  let discoveryFailedAt = 0;

  async function keys() {
    if (keySet) return keySet;
    if (opts.jwksUri) {
      keySet = createRemoteJWKSet(new URL(opts.jwksUri), {
        timeoutDuration: FETCH_TIMEOUT_MS,
      });
      return keySet;
    }
    if (Date.now() - discoveryFailedAt < DISCOVERY_RETRY_MS) return undefined;

    discovering ??= discoverJwksUri(issuer)
      .then((uri) => {
        keySet = createRemoteJWKSet(new URL(uri), {
          timeoutDuration: FETCH_TIMEOUT_MS,
        });
        return keySet;
      })
      .catch(() => {
        discoveryFailedAt = Date.now();
        return undefined;
      })
      .finally(() => {
        discovering = undefined;
      });
    return discovering;
  }

  async function verifySignature(token: string, jwks: KeySet) {
    const options = {
      algorithms: ["RS256"],
      issuer,
      audience,
      typ: ACCESS_TOKEN_TYP,
      requiredClaims: ["exp"],
      clockTolerance: CLOCK_SKEW_SECONDS,
      currentDate: currentDate(),
    };

    try {
      return (await jwtVerify(token, jwks, options)).payload;
    } catch (err) {
      // A key rotated under the same kid fails the signature until the cache
      // expires, so refetch once, within jose's cooldown.
      if (
        !(err instanceof errors.JWSSignatureVerificationFailed) ||
        !jwks.reload ||
        jwks.coolingDown
      ) {
        throw err;
      }
    }

    await jwks.reload();
    return (await jwtVerify(token, jwks, options)).payload;
  }

  async function verify(token: string): Promise<ResourceServerUser | null> {
    try {
      const header = decodeProtectedHeader(token);
      if (typeof header.kid !== "string" || !header.kid || "crit" in header) {
        return null;
      }

      const jwks = await keys();
      if (!jwks) return null;

      const claims = await verifySignature(token, jwks);
      const user = toUser(claims, token);
      if (!user) return null;

      if (claims.cnf !== undefined && claims.cnf !== null) {
        if (!confirm || (await confirm(claims.cnf, claims)) !== true)
          return null;
      }

      return user;
    } catch {
      return null;
    }
  }

  async function authenticate(
    authorization: string | undefined,
  ): Promise<ResourceServerAuthResult> {
    const token = extractBearerToken(authorization);
    if (!token) return { rejection: MISSING_TOKEN };

    const user = await verify(token);
    return user ? { user } : { rejection: INVALID_TOKEN };
  }

  function authorizeScopes(
    user: ResourceServerUser | undefined,
    scopes: string | string[],
  ): GuardRejection | undefined {
    if (!user) return MISSING_TOKEN;

    const required = Array.isArray(scopes) ? scopes : [scopes];
    if (required.every((scope) => user.scopes.includes(scope)))
      return undefined;

    const scope = required.join(" ");
    return {
      status: 403,
      errorCode: "insufficient_scope",
      detail: { scope },
      headers: {
        "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${quote(scope)}"`,
      },
    };
  }

  function authorizeRoles(
    user: ResourceServerUser | undefined,
    roles: string | string[],
  ): GuardRejection | undefined {
    if (!user) return MISSING_TOKEN;

    const required = Array.isArray(roles) ? roles : [roles];
    const granted = required.some((role) =>
      user.roles.some((held) => roleGrantsAccess(held, role)),
    );
    return granted
      ? undefined
      : { status: 403, errorCode: "insufficient_role" };
  }

  function stepUp(requirement: StepUpRequirement) {
    const { acrValues, amr, maxAge } = requirement;

    if (!acrValues?.length && !amr?.length && maxAge === undefined) {
      throw new Error("stepUp: give acrValues, amr or maxAge");
    }
    if (maxAge !== undefined && !(Number.isInteger(maxAge) && maxAge >= 0)) {
      throw new Error(
        "stepUp: maxAge must be a whole number of seconds, zero or more",
      );
    }

    const accepted = new Set(acrValues ?? []);
    if (accepted.has("phr")) accepted.add("phrh");

    return (
      user: ResourceServerUser | undefined,
    ): GuardRejection | undefined => {
      if (!user) return MISSING_TOKEN;

      const levelMet =
        (!acrValues?.length ||
          (user.acr !== undefined && accepted.has(user.acr))) &&
        (amr ?? []).every((value) => user.amr.includes(value));

      const now = Math.floor(currentDate().getTime() / 1000);
      const recentEnough =
        maxAge === undefined ||
        (user.authTime !== undefined && now - user.authTime <= maxAge);

      if (levelMet && recentEnough) return undefined;

      const description = levelMet ? MORE_RECENT : DIFFERENT_LEVEL;
      const detail: Record<string, unknown> = {
        error_description: description,
      };
      let challenge = `Bearer error="insufficient_user_authentication", error_description="${description}"`;

      if (acrValues?.length) {
        detail.acr_values = acrValues.join(" ");
        challenge += `, acr_values="${quote(acrValues.join(" "))}"`;
      }
      if (maxAge !== undefined) {
        detail.max_age = maxAge;
        challenge += `, max_age="${maxAge}"`;
      }

      return {
        status: 401,
        errorCode: "insufficient_user_authentication",
        detail,
        headers: { "WWW-Authenticate": challenge },
      };
    };
  }

  return { verify, authenticate, authorizeScopes, authorizeRoles, stepUp };
}
