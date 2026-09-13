import { jwtVerify } from "jose";
import { getAuthServerJwks } from "./jwks.js";
import { getSeamlessLogger } from "./logger.js";

export async function verifySignedAuthResponse<T = any>(
  token: string,
  authServerUrl: string,
  audience: string,
): Promise<T | null> {
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

    return payload as T;
  } catch {
    getSeamlessLogger().error(
      "[SeamlessAuth] Failed to verify signed auth response.",
    );
    return null;
  }
}
