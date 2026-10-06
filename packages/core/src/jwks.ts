import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { JWTPayload, JWTVerifyOptions } from "jose";

// jose caches keys and applies a refetch cooldown per JWKS instance, so the instance
// must outlive a single call. Memoize per JWKS URL (one per auth server, so the map
// stays tiny) instead of building a fresh, empty-cache instance on every verification.
const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function getAuthServerJwks(
  authServerUrl: string,
): ReturnType<typeof createRemoteJWKSet> {
  const jwksUrl = new URL("/.well-known/jwks.json", authServerUrl).toString();

  let jwks = jwksByUrl.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksByUrl.set(jwksUrl, jwks);
  }
  return jwks;
}

/**
 * Verifies a JWT against the auth server's key set, refetching it once when the
 * signature does not match a cached key.
 *
 * jose refetches on its own only for an unknown kid. When the auth server signs
 * with a new key under the same kid (a recreated dev container regenerates its
 * keys this way), the cached key fails every signature until the cache expires.
 * `reload()` ignores jose's cooldown, so the cooldown is checked here: a stream
 * of bad signatures costs at most one JWKS fetch per cooldown window.
 */
export async function verifyWithAuthServerJwks(
  token: string,
  authServerUrl: string,
  options: JWTVerifyOptions,
): Promise<JWTPayload> {
  const jwks = getAuthServerJwks(authServerUrl);

  try {
    const { payload } = await jwtVerify(token, jwks, options);
    return payload;
  } catch (err) {
    if (
      !(err instanceof errors.JWSSignatureVerificationFailed) ||
      jwks.coolingDown
    ) {
      throw err;
    }
  }

  await jwks.reload();
  const { payload } = await jwtVerify(token, jwks, options);
  return payload;
}
