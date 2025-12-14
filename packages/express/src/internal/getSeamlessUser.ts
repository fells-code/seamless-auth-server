import { authFetch } from "./authFetch.js";
import { CookieRequest } from "../middleware/ensureCookies.js";
import { verifyCookieJwt } from "./verifyCookieJwt.js";

/**
 * Retrieves the authenticated Seamless Auth user for a request by calling
 * the upstream Seamless Auth Server’s introspection endpoint.
 *
 * This helper is used when server-side code needs the fully hydrated
 * Seamless Auth user object (including roles, metadata, and profile fields),
 * not just the JWT payload extracted from cookies.
 *
 * Unlike `requireAuth`, this helper does **not** enforce authentication.
 * It simply returns:
 * - The resolved user object (if the session is valid)
 * - `null` if the session is invalid, expired, or missing
 *
 * ### Responsibilities
 * - Extracts the access cookie (or refresh cookie when needed)
 * - Calls the Seamless Auth Server’s `/internal/session/introspect` endpoint
 * - Validates whether the session is active
 * - Returns the user object or `null` without throwing
 *
 * ### Use Cases
 * - Fetching the current user in internal APIs
 * - Enriching backend requests with server-authoritative user information
 * - Logging, analytics, auditing
 * - Optional-auth routes that behave differently for signed-in users
 *
 * ### Example
 * ```ts
 * app.get("/portal/me", async (req, res) => {
 *   const user = await getSeamlessUser(req, process.env.SA_AUTH_SERVER_URL);
 *
 *   if (!user) {
 *     return res.json({ user: null });
 *   }
 *
 *   return res.json({ user });
 * });
 * ```
 *
 * ### Returns
 * - A full Seamless Auth user object (if active)
 * - `null` if not authenticated or session expired
 *
 * @param req - The Express request object containing auth cookies.
 * @param authServerUrl - Base URL of the Seamless Auth instance to introspect against.
 * @param cookieName - Name of the access cookie storing the session JWT (`"seamless-access"` by default).
 *
 * @returns The authenticated user object, or `null` if the session is inactive.
 */
export async function getSeamlessUser<T = any>(
  req: CookieRequest,
  authServerUrl: string,
  cookieName: string = "seamless-access"
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
