import type { ResultFailure } from "./result.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
