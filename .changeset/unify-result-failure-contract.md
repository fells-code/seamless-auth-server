---
"@seamless-auth/core": major
"@seamless-auth/express": major
---

Split the handler result `error` field into `errorCode` and `errorBody`.

`error` meant two different things depending on which handler produced it. On 12 sites it held the auth API's whole failure body, forwarded to the caller unchanged. On 8 sites it held a short code that the adapter wrapped as `{ error }`. The declared types could not describe either honestly, and `FinishLoginResult` declared `error?: string` while assigning the whole body. Nothing in the type told an adapter which rendering applied, which is the first thing a second adapter has to get right.

Failures are now reported through `ResultFailure`, exported from `@seamless-auth/core`:

- `errorCode?: string` is a code this package chose. Adapters render it as `{ error, details }`.
- `errorBody?: unknown` is the auth API's own failure body. Adapters forward it unchanged.

BREAKING for code that reads `result.error` off a handler imported from `@seamless-auth/core/handlers/*`. Read `errorBody` for the auth-flow handlers (login, finishLogin, register, finishRegister, requestOtp, verifyLoginOtp, requestMagicLink, pollMagicLinkConfirmation, verifyMagicLink, switchOrganization, and the OAuth handlers) and `errorCode` for the rest (me, ensureCookies, admin, sessions, internalMetrics, systemConfig). The OAuth handlers return a union, so `"error" in result` becomes `"errorBody" in result`.

The HTTP responses are unchanged, so no adopter application, SDK, or dashboard needs to change. This was verified rather than assumed: the adapter's failure responses were captured on both revisions across 6 upstream body shapes and 3 route kinds and compared, and all 18 are byte-identical. They were also run through `extractMessage` and `getOAuthErrorCode` from `seamless-auth-react`, with identical results, including the OAuth `code` that has to stay at the top level of the body.

A new `failureWireFormat` test in `@seamless-auth/express` locks these shapes so later refactors cannot move them silently.
