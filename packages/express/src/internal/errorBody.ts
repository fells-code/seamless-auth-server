/**
 * Renders a core proxy result's failure into the JSON body sent to the caller,
 * forwarding the upstream detail the auth API returned alongside the code.
 */
export function errorBody(result: { error?: string; details?: unknown }) {
  return result.details === undefined
    ? { error: result.error }
    : { error: result.error, details: result.details };
}
