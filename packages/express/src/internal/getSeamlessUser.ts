import type { Request } from "express";
import { authFetch } from "./authFetch.js";
import { verifySignedAuthResponse } from "./verifySignedAuthResponse.js";

/**
 * Retrieves the Seamless Auth user information by calling the auth server's introspection endpoint.
 * Requires the sa_session (or custom) cookie to be present on the request.
 *
 * @param req Express request object
 * @param authServerUrl Base URL of the client's auth server
 * @returns The user data object if valid, or null if invalid/unauthenticated
 */
export async function getSeamlessUser<T = any>(
  req: Request,
  authServerUrl: string,
): Promise<T | null> {
  try {
    const response = await authFetch(req, `${authServerUrl}/users/me`, {
      method: "GET",
    });

    if (!response.ok) {
      console.warn(`[SeamlessAuth] Auth server responded ${response.status}`);
      return null;
    }

    const data = (await response.json()) as any;

    const verified = await verifySignedAuthResponse(data.token, authServerUrl);

    if (!verified) {
      throw new Error("Invalid signed response from Auth Server");
    }

    if (verified.sub !== data.sub) {
      throw new Error("Signature mismatch with data payload");
    }

    return data.user as T;
  } catch (err) {
    console.error("[SeamlessAuth] getSeamlessUser failed:", err);
    return null;
  }
}
