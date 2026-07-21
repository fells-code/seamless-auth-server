---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
---

Post-release follow-up cleanups from the pre-release audit.

- Bound the refresh-result cache in core. Entries were keyed by the rotating refresh cookie and never revisited, so the map grew without limit and retained tokens for the process lifetime. It now sweeps expired entries (throttled) and caps total size.
- Memoize the JWKS key set per auth-server URL in `verifySignedAuthResponse`. It was rebuilt on every call, so jose's key cache and refetch cooldown never engaged and every verification made an extra request to `/.well-known/jwks.json`.
- `SeamlessAuthUser.email` is now optional and `phone` is `string | null`, matching the cookie payload and the upstream `/users/me` shape. This is a type-level change: consumers that treated `phone` as a non-null `string` will need to handle `null`.
- Export `redactSensitiveText` from core and use it to mask tokens and secrets before the Express router logs an unhandled error.
- Reorder the `/magic-link/check` cookie requirement so it is no longer shadowed by `/magic-link`, throw a clear error when a route parameter is missing instead of forwarding the literal string `"undefined"`, correct the `Missing cookieSecret` message that named a removed environment variable, and drop a redundant terminal `.end()` after `res.json(...)`.
