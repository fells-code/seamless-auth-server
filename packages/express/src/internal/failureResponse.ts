import type { ResultFailure } from "@seamless-auth/core";

/**
 * Renders a coded failure into the JSON body sent to the caller, forwarding the
 * upstream detail the auth API returned alongside the code.
 *
 * Only for `errorCode`. A result carrying `errorBody` is the auth API's own
 * failure body and is sent unchanged, because callers read fields off it.
 */
export function failureResponse(result: ResultFailure) {
  return result.details === undefined
    ? { error: result.errorCode }
    : { error: result.errorCode, details: result.details };
}
