import jwt, { type JwtPayload } from "jsonwebtoken";

export interface RefreshCookiePayload extends JwtPayload {
  sub: string;
  refreshToken: string;
}

export function verifyRefreshCookie(
  token: string,
  cookieSecret: string,
): RefreshCookiePayload | null {
  try {
    return jwt.verify(token, cookieSecret, {
      algorithms: ["HS256"],
    }) as RefreshCookiePayload;
  } catch {
    return null;
  }
}
