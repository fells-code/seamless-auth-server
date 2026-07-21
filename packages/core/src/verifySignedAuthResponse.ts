import { createRemoteJWKSet, jwtVerify } from "jose";

// jose caches keys and applies a refetch cooldown per JWKS instance, so the instance
// must outlive a single call. Memoize per JWKS URL (one per auth server, so the map
// stays tiny) instead of building a fresh, empty-cache instance on every verification.
const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksByUrl.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksByUrl.set(jwksUrl, jwks);
  }
  return jwks;
}

export async function verifySignedAuthResponse<T = any>(
  token: string,
  authServerUrl: string,
  audience: string,
): Promise<T | null> {
  try {
    const jwksUrl = new URL("/.well-known/jwks.json", authServerUrl).toString();
    const JWKS = getJwks(jwksUrl);

    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ["RS256"],
      issuer: authServerUrl,
      audience,
    });

    return payload as T;
  } catch {
    console.error("[SeamlessAuth] Failed to verify signed auth response.");
    return null;
  }
}
