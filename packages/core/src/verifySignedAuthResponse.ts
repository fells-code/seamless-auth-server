import { createRemoteJWKSet, jwtVerify } from "jose";

export async function verifySignedAuthResponse<T = any>(
  token: string,
  authServerUrl: string,
): Promise<T | null> {
  try {
    const jwksUrl = new URL("/.well-known/jwks.json", authServerUrl).toString();
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ["RS256"],
      issuer: authServerUrl,
    });

    return payload as T;
  } catch (err) {
    console.error("[SeamlessAuth] Failed to verify signed auth response:", err);
    return null;
  }
}
