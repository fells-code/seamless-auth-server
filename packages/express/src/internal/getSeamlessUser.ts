import type { Request } from "express";
import { authFetch } from "./authFetch.js";
import { verifySignedAuthResponse } from "./verifySignedAuthResponse.js";
import { CookieRequest } from "../middleware/ensureCookies.js";
import { verifyCookieJwt } from "./verifyCookieJwt.js";

/**
 * Retrieves the Seamless Auth user information by calling the auth server's introspection endpoint.
 * Requires the sa_session (or custom) cookie to be present on the request.
 *
 * @param req Express request object
 * @param authServerUrl Base URL of the client's auth server
 * @returns The user data object if valid, or null if invalid/unauthenticated
 */
export async function getSeamlessUser<T = any>(
  req: CookieRequest,
  authServerUrl: string,
  cookieName: string = "seamless-auth-access"
): Promise<T | null> {
  try {
    const payload = verifyCookieJwt(req.cookies[cookieName]);
    if (!payload) {
      throw new Error("Missing cookie");
    }

    req.cookiePayload = payload;
    const response = await authFetch(req, `${authServerUrl}/users/me`, {
      method: "GET",
    });

    if (!response.ok) {
      console.warn(`[SeamlessAuth] Auth server responded ${response.status}`);
      return null;
    }

    const data = (await response.json()) as any;

    return data.user as T;
  } catch (err) {
    console.error("[SeamlessAuth] getSeamlessUser failed:", err);
    return null;
  }
}
