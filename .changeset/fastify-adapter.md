---
"@seamless-auth/fastify": minor
---

Add `@seamless-auth/fastify`, a Fastify adapter serving the same routes as the Express adapter.

Register it under a prefix and it serves the auth flows, the passthrough proxy routes, and the admin, session, metrics, and system-config routes, managing the session cookies they depend on. `requireAuth` and `requireRole` are exported as `preHandler` hooks for an adopter's own routes, alongside `getSeamlessUser`.

Both adapters emit identical responses. A parity suite runs the same requests through each against the same mocked auth API and asserts the status, body, and every `Set-Cookie` header match, so the two cannot drift.

`createSeamlessConsoleProxy` has no Fastify equivalent yet. It proxies the admin console's static assets and is separate from the auth routes.
