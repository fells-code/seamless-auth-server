---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Add verify-only resource servers for APIs that receive the OpenID Provider's access tokens (RFC 9068). `createResourceServer({ issuer, audience })` needs no cookie secret, service secret or auth routes: it finds the provider's keys through discovery (or `jwksUri` / `jwks`), checks `iss`, `aud`, the `at+jwt` header and the token's claims, and refuses a sender-constrained (`cnf`) token unless a `confirm` hook accepts it.

Express and Fastify get `requireAuth()`, `requireScope()`, `requireRole()` and `requireStepUp()` guards; Next.js gets `protect(handler, { scopes, roles, stepUp })` and `authenticate(request)`. `requireStepUp({ acrValues: ["phr"], maxAge: 300 })` answers with the RFC 9470 `insufficient_user_authentication` challenge. The verified user carries `clientId`, `scopes`, `sid`, `orgId`, `acr`, `amr` and `authTime`, and `request.user` is widened with those as optional fields. `GuardRejection` gains optional `headers`.

Every Seamless adapter (these, Go, Python and Rust) answers the same signed vectors in `packages/core/tests/fixtures/verify-only` the same way.
