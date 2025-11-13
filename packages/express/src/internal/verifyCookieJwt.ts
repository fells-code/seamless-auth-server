import jwt from "jsonwebtoken";

const COOKIE_SECRET = process.env.SEAMLESS_COOKIE_SIGNING_KEY!;

export function verifyCookieJwt<T = any>(token: string): T | null {
  try {
    return jwt.verify(token, COOKIE_SECRET, {
      algorithms: ["HS256"],
    }) as T;
  } catch (err) {
    console.error("[SeamlessAuth] Cookie JWT verification failed:", err);
    return null;
  }
}
