/**
 * A response body with the auth API's tokens removed.
 *
 * In cookie transport the cookies carry every token, so the browser must never
 * see one in a body: a page script could read it, and bodies end up where cookies
 * do not (devtools exports, APM payload capture, service workers, proxy logs).
 * That covers ephemeral tokens as well as sessions, because the auth API also
 * returns the token it re-mints on an OTP send and the one it issues on
 * registration.
 */
export function withoutTokens(data: unknown): unknown {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return data;
  }

  const { token: _token, refreshToken: _refreshToken, ...rest } = data as Record<
    string,
    unknown
  >;

  return rest;
}
