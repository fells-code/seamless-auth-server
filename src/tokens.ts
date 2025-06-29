import { jwtVerify, createRemoteJWKSet } from "jose";

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

export function getJwks(jwksUrl: string) {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwksCache;
}

export async function verifyToken(token: string, jwksUrl: string) {
  try {
    const jwks = getJwks(jwksUrl);
    const { payload } = await jwtVerify(token, jwks);
    return payload;
  } catch (err) {
    console.error("Token verification failed", err);
    return null;
  }
}
