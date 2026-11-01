---
"@seamless-auth/core": minor
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Calls to the auth API now behave the same as in the Go, Python and Rust adapters.

- OTP generation and magic link requests use `POST`. The `GET` routes they called are deprecated in the auth API and missing from its adapter manifest.
- Every call times out after 15 seconds (`timeoutMs` on `authFetch`). An auth API that cannot be reached or does not answer in time gets `502 {"error":"upstream_unavailable"}` instead of a hung request or `500 internal_error`.
- The key set is fetched from `authServerUrl` with its path kept, so an auth API mounted under a prefix such as `https://example.com/auth-api` is verified against its own keys.
- `/registration/register` verifies the registration token (issuer, audience, `typ` `ephemeral`, and a `sub` matching the body) before it sets the registration cookie or returns the token to a bearer client, and answers `502 {"error":"invalid_upstream_session"}` when it fails.

Breaking for code that calls `registerHandler` from `@seamless-auth/core` directly: `RegisterOptions` now requires `audience` and accepts `authServerIssuer`, like `LoginOptions`. The express, fastify and nextjs adapters pass both already.
