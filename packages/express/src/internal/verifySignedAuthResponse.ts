import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Verifies a signed response JWT from a Seamless Auth server.
 * Uses the Auth Server's JWKS endpoint to dynamically fetch public keys.
 */
export async function verifySignedAuthResponse<T = any>(
  token: string,
  authServerUrl: string
): Promise<T | null> {
  try {
    // Construct JWKS URL from auth server
    const jwksUrl = new URL("/.well-known/jwks.json", authServerUrl).toString();

    // Create a remote JWKS verifier (auto-caches)
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    // Verify signature and algorithm
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ["RS256"],
    });

    return payload as T;
  } catch (err) {
    console.error("[SeamlessAuth] Failed to verify signed auth response:", err);
    return null;
  }
}