import jwt, { type JwtPayload } from "jsonwebtoken";

export function verifyCookieJwt<T extends JwtPayload = JwtPayload>(
  token: string,
  secret: string,
): T | null {
  try {
    return jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as T;
  } catch {
    // Intentional no-op
    return null;
  }
}
