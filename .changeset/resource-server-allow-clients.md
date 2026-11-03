---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Let a verify-only resource server require a user rather than a client credentials token (#260). The Express and Fastify `requireAuth` guards from `createResourceServer` take `{ allowClients: false }`, the Next.js `protect` and `authenticate` requirements take `allowClients: false`, and core's `authenticate(authorization, { allowClients: false })` does the same. A verified token whose user has `isClient` set is then refused with `403 {"error":"user_required"}` and no `WWW-Authenticate` header, the same shape as `insufficient_role`. A token that fails verification still gets `401` first. `allowClients` defaults to `true`, so existing routes are unchanged.

The shared verify-only vectors gain `is_client` on each accepted token and a `user_required_requests` list. Both are additive, so the Go, Python and Rust copies keep passing until those adapters implement the option.
