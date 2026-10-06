---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Recover when the auth server starts signing with a new key under the same `kid`. The cached key set was only refetched for an unknown `kid`, so after such a change (a recreated local auth container regenerates its dev key this way) every signed auth response and Bearer token failed verification for up to 10 minutes, and sign-in answered 500 until the application restarted. A signature that does not match a cached key now refetches the key set once and verifies again, at most once per 30 second cooldown so a stream of bad signatures cannot hammer the JWKS endpoint. The verification failure log now includes the `jose` error code. Fixes #184.
