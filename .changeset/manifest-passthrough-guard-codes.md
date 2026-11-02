---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Passthrough routes come from the auth API's adapter manifest, and guard and not-found responses match the Go, Python and Rust adapters.

Breaking response changes:

- `requireAuth` answers `401 {"error":"unauthenticated"}` for a missing, invalid or expired session and for an ephemeral token. It used to answer `"Failed to find authentication token required"` or `"Invalid or expired session"`.
- `requireRole` answers `403 {"error":"insufficient_role"}` when no listed role is granted, including for a user with no roles. The body no longer carries `required` and `actual`, so a client never sees the user's roles. A request no guard authenticated gets `401 {"error":"unauthenticated"}`.
- In Express, a path under the auth router that no route and no manifest entry matches answers `404 {"error":"not_found"}` instead of calling `next()`. Fastify and Next.js already did.
- `POST /users/update` is no longer served. The auth API has no such route, so it only ever answered the API's 404.

The static passthrough tables are gone. Organizations, step-up, TOTP, credentials, OAuth provider configuration, admin organizations, enrollment, review accounts, the auth event export and integrity check, and the coverage report are served from the manifest, like any other route the adapter has no handler for. In cookie transport their bodies no longer carry `token` or `refreshToken`. A dot segment in one of their path parameters answers `404 not_found` rather than `400 bad_request`, and no upstream call is made either way. A recovery session that enrolls an authenticator app is still rotated right away.

OTP verification, magic link polling and verification, and organization switching also drop tokens from a cookie-transport body when the auth API's answer is not a complete session.

`setSeamlessLogger` and the `SeamlessLogger` type are exported from `@seamless-auth/express`, `@seamless-auth/fastify` and `@seamless-auth/nextjs`, and every warning and error those packages log goes through it.
