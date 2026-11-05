/**
 * How a handler reports a failure.
 *
 * At most one of the two is set, and they are rendered differently, which is
 * why they are separate fields rather than one `error`:
 *
 * - `errorCode` is a code this package chose. The adapter renders it as
 *   `{ error, details }`.
 * - `errorBody` is the auth API's own failure body, which the adapter forwards
 *   unchanged. Callers read fields off it directly, so it must not be reshaped:
 *   the React SDK reads a top-level `code` to tell OAuth failures apart, and a
 *   top-level `error` or `message` for the message it shows.
 *
 * Before this split both meanings shared one `error` field, so its type could
 * not be honest about either and an adapter could not render it without knowing
 * which handler produced it.
 */
export interface ResultFailure {
  errorCode?: string;
  errorBody?: unknown;
  details?: unknown;
}

/** The body a failure goes out as: the auth API's own, else `{ error, details }`. */
export function failureBody(result: ResultFailure): unknown {
  if (result.errorBody !== undefined) return result.errorBody;

  return result.details === undefined
    ? { error: result.errorCode }
    : { error: result.errorCode, details: result.details };
}
