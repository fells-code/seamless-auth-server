---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Forward the service token from `getSeamlessUser`, so the client IP it sends is honored again.

`GetSeamlessUserOptions` did not declare `serviceAuthorization` and the core `authFetch` call never passed it. The Express adapter still computed the service token and passed it, but an `as GetSeamlessUserOptions` cast on the option literal discarded it without a type error. Every `getSeamlessUser` call therefore sent `x-seamless-client-ip` with no accompanying service token, and the auth server ignores the forwarded IP unless a valid service token rides with it. Rate limiting, lockout, and anomaly detection attributed those requests to the adapter's egress IP instead of the end user's. This restores the behavior added in 0.7.0.

`GetSeamlessUserOptions.authorization` is now optional, which matches what the adapter already passed: it resolves the user's access token from `req.cookiePayload` or `req.user`, both of which are unset when `getSeamlessUser` is called outside the auth router or the `requireAuth` guard. The required type was only satisfied by the same cast that hid the dropped service token.
