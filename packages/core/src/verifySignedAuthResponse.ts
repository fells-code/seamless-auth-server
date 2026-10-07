import { errors } from "jose";
import { resolveAuthServerIssuer } from "./authServerIssuer.js";
import { verifyWithAuthServerJwks } from "./jwks.js";
import { getSeamlessLogger } from "./logger.js";

/**
 * Verifies a response the auth server signed, against its JWKS.
 *
 * `authServerIssuer` is the expected `iss` and defaults to `authServerUrl`; see
 * `AuthServerIssuerOption` for when the two differ.
 */
export async function verifySignedAuthResponse<T = any>(
  token: string,
  authServerUrl: string,
  audience: string,
  authServerIssuer?: string,
): Promise<T | null> {
  try {
    const payload = await verifyWithAuthServerJwks(token, authServerUrl, {
      algorithms: ["RS256"],
      issuer: resolveAuthServerIssuer(authServerUrl, authServerIssuer),
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
