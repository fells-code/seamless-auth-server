---
"@seamless-auth/core": patch
---

Return a code instead of an empty response when the auth API fails with no body.

The auth-flow routes forward the API's failure body rather than interpreting it, and an empty body left nothing to forward: the caller got a bare 4xx with no content, and `seamless-auth-react` fell back to its per-call generic message with no way to tell an expired session from a rate limit from an upstream outage. The proxy routes already handled this, so the two families disagreed on the one case where the caller had least to go on.

An empty failure body now becomes `{ "error": "upstream_error" }`. A body that is present is still forwarded untouched, including the top-level `code` the React SDK reads to tell OAuth failures apart.

New exports: `readPassthroughFailure` and `UPSTREAM_ERROR_CODE`.

Closes #125.
