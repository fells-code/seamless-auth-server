# @seamless-auth/fastify

## 0.1.0

### Minor Changes

- f032a64: Add `@seamless-auth/fastify`, a Fastify adapter serving the same routes as the Express adapter.

  Register it under a prefix and it serves the auth flows, the passthrough proxy routes, and the admin, session, metrics, and system-config routes, managing the session cookies they depend on. `requireAuth` and `requireRole` are exported as `preHandler` hooks for an adopter's own routes, alongside `getSeamlessUser`.

  Both adapters emit identical responses. A parity suite runs the same requests through each against the same mocked auth API and asserts the status, body, and every `Set-Cookie` header match, so the two cannot drift.

  `createSeamlessConsoleProxy` has no Fastify equivalent yet. It proxies the admin console's static assets and is separate from the auth routes.

### Patch Changes

- Updated dependencies [f032a64]
- Updated dependencies [c52b5d1]
- Updated dependencies [519a1b0]
- Updated dependencies [3c5c1c5]
- Updated dependencies [d17896b]
- Updated dependencies [9735f83]
- Updated dependencies [9e04625]
- Updated dependencies [82fc15a]
- Updated dependencies [d7d408d]
- Updated dependencies [744418b]
- Updated dependencies [17c5487]
- Updated dependencies [583271a]
- Updated dependencies [a5e3070]
- Updated dependencies [8e03099]
  - @seamless-auth/core@0.11.0
