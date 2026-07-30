import type { ResultFailure } from "./result.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Last-resort code for a failure the auth API sent with no body at all.
 *
 * A passthrough route has nothing else to say: it does not interpret the
 * response, so when there is no body there is no detail to forward.
 */
export const UPSTREAM_ERROR_CODE = "upstream_error";

/**
 * Reads an upstream failure for a route that forwards the auth API's response
 * rather than interpreting it.
 *
 * The body goes through verbatim whenever there is one, because callers read
 * fields off it directly and reshaping it breaks them. An empty body has nothing
 * to forward, and returning it as-is produced a bare status with no body, which
 * left the caller with nothing to act on and the SDK falling back to a generic
 * message (#125). That case becomes a code instead.
 */
export function readPassthroughFailure(
  data: unknown,
  fallback: string = UPSTREAM_ERROR_CODE,
): ResultFailure {
  return isObject(data) ? { errorBody: data } : { errorCode: fallback };
}

/**
 * Reads an upstream error body into the `{ error, details }` pair the proxy
 * handlers return.
 *
 * The auth API answers a validation failure with a Zod body shaped
 * `{ name, message }` and no `error` key, so keying only off `error` collapsed
 * every one of them to the caller-opaque fallback code and dropped the name of
 * the rejected field (#115). `details` carries the upstream body whenever it
 * holds more than the derived error string.
 */
export function readUpstreamFailure(
  data: unknown,
  fallback: string,
): ResultFailure {
  if (!isObject(data)) {
    return { errorCode: fallback };
  }

  const errorCode =
    typeof data.error === "string"
      ? data.error
      : typeof data.message === "string"
        ? data.message
        : fallback;

  const keys = Object.keys(data);
  if (keys.length === 1 && data[keys[0]] === errorCode) {
    return { errorCode };
  }

  return { errorCode, details: data };
}
