import { createRemoteJWKSet } from "jose";

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
