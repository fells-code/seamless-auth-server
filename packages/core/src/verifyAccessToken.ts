import { jwtVerify, type JWTPayload } from "jose";
import { getAuthServerJwks } from "./jwks.js";

/**
 * The claims the auth API signs into an access token.
 *
 * `typ` is what separates a session from the ephemeral token a sign-in flow
 * carries between steps. Both are RS256, both have the same issuer and
 * audience, so a verifier that only checks the signature would accept a
 * registration-in-progress as a signed-in user.
 */
export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  typ: "access";
  sid?: string;
  roles?: string[];
  org_id?: string;
}

/**
 * Returns a bearer token's value, or `undefined` when the header is absent or
 * uses another scheme.
 */
export function extractBearerToken(
  authorization: string | undefined,
): string | undefined {
  if (!authorization) return undefined;

  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || rest.length !== 1) {
    return undefined;
  }

  return rest[0] || undefined;
}

/**
 * Verifies an access token the auth API issued, against its JWKS.
 *
 * Silent on failure: a guard turns `null` into a 401 and has nothing useful to
 * add from the reason, while logging the reason for every bad token a client
 * sends is a log-flooding vector.
 */
export async function verifyAccessToken(
  token: string,
  authServerUrl: string,
  audience: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      getAuthServerJwks(authServerUrl),
      {
        algorithms: ["RS256"],
        issuer: authServerUrl,
        audience,
      },
    );

    if (payload.typ !== "access" || typeof payload.sub !== "string") {
      return null;
    }

    return payload as AccessTokenClaims;
  } catch {
    return null;
  }
}
