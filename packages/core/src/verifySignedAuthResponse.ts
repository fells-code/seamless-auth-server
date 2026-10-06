import { errors } from "jose";
import { verifyWithAuthServerJwks } from "./jwks.js";
import { getSeamlessLogger } from "./logger.js";

export async function verifySignedAuthResponse<T = any>(
  token: string,
  authServerUrl: string,
  audience: string,
): Promise<T | null> {
  try {
    const payload = await verifyWithAuthServerJwks(token, authServerUrl, {
      algorithms: ["RS256"],
      issuer: authServerUrl,
      audience,
    });

    return payload as T;
  } catch (err) {
    const reason = err instanceof errors.JOSEError ? ` (${err.code})` : "";
    getSeamlessLogger().error(
      `[SeamlessAuth] Failed to verify signed auth response${reason}.`,
    );
    return null;
  }
}
