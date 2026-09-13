/**
 * How a client carries its session through the adapter.
 *
 * `cookie` is the browser contract: the adapter holds the auth API's tokens in
 * signed `httpOnly` cookies and the client never sees them. `bearer` is the
 * native-client contract: the client holds the auth API's own tokens, presents
 * the one a route needs in `Authorization`, and receives new ones in the
 * response body. The adapter still sits in front of the auth API for both, so
 * message delivery, client IP forwarding and the service token work the same.
 */
export type AuthTransport = "cookie" | "bearer";

/**
 * Selects bearer transport for a request. The header rather than the presence
 * of `Authorization` decides, because the first request of a flow (`/login`,
 * `/registration/register`) carries no token in either transport.
 */
export const AUTH_TRANSPORT_HEADER = "x-seamless-auth-transport";
export const BEARER_TRANSPORT = "bearer";

export function resolveAuthTransport(
  headerValue: string | string[] | undefined,
): AuthTransport {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  return value?.trim().toLowerCase() === BEARER_TRANSPORT ? "bearer" : "cookie";
}
