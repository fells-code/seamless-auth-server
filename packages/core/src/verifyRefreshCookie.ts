import jwt, { type JwtPayload } from "jsonwebtoken";

export interface RefreshCookiePayload extends JwtPayload {
  sub: string;
  refreshToken: string;
}

export function verifyRefreshCookie(
  token: string,
  cookieSecret: string,
): RefreshCookiePayload | null {
  let payload: JwtPayload | string;
  try {
    payload = jwt.verify(token, cookieSecret, {
      algorithms: ["HS256"],
    });
  } catch {
    return null;
  }

  // Every adapter cookie is signed with the same secret, and /login hands out a
  // pre-auth cookie for any existing account from its email address alone. So the
  // signature does not make this a refresh cookie. Only a refresh cookie holds a
  // refresh token, and none of them holds an upstream access or ephemeral token.
  if (
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.refreshToken !== "string" ||
    !payload.refreshToken ||
    "token" in payload
  ) {
    return null;
  }

  return payload as RefreshCookiePayload;
}
