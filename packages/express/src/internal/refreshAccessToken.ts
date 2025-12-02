import { CookieRequest } from "../middleware/ensureCookies.js";
import jwt, { JwtPayload } from "jsonwebtoken";

export async function refreshAccessToken(
  req: CookieRequest,
  authServerUrl: string,
  refreshToken: string
): Promise<{
  sub: string;
  token: string;
  refreshToken: string;
  roles: string[];
  ttl: number;
  refreshTtl: number;
} | null> {
  try {
    const COOKIE_SECRET = process.env.SEAMLESS_COOKIE_SIGNING_KEY!;
    if (!COOKIE_SECRET) {
      console.warn(
        "[SeamlessAuth] SEAMLESS_COOKIE_SIGNING_KEY missing — requireAuth will always fail."
      );
      throw new Error("Missing required env SEAMLESS_COOKIE_SIGNING_KEY");
    }
    const serviceKey = process.env.SEAMLESS_SERVICE_TOKEN;
    if (!serviceKey) {
      throw new Error(
        "Cannot sign service token. Missing SEAMLESS_SERVICE_TOKEN"
      );
    }

    // unwrap token with local key and rewrap with service key
    const payload = jwt.verify(refreshToken, COOKIE_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload;

    const token = jwt.sign(
      {
        // Minimal, safe fields
        iss: process.env.FRONTEND_URL,
        aud: process.env.AUTH_SERVER_URL,
        sub: payload.sub,
        refreshToken: payload.refreshToken,
        iat: Math.floor(Date.now() / 1000),
      },
      serviceKey,
      {
        expiresIn: "60s", // Short-lived = safer
        algorithm: "HS256", // HMAC-based
        keyid: "dev-main", // For future rotation
      }
    );
    const response = await fetch(`${authServerUrl}/refresh`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error(
        "[SeamlessAuth] Refresh token request failed:",
        response.status
      );
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error("[SeamlessAuth] refreshAccessToken error:", err);
    return null;
  }
}
