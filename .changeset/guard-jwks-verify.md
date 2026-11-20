---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
---

Verify the access token inside a session cookie against the auth API's JWKS in the Express and Fastify guards, and take the session's roles, permissions and organization from it alone.

Behaviour changes:

- `requireAuth` in `@seamless-auth/express` and `@seamless-auth/fastify` now requires `authServerUrl` and `audience`, and throws when it is constructed without them. The types mark both as required. Before, leaving them out gave a cookie-only guard that trusted the cookie's payload, so anyone holding `cookieSecret` could sign a cookie with any identity, roles or permissions. The Next.js guards already worked this way.
- With the pair set, the guard verifies the cookie's inner access token (issuer, audience, expiry, `typ: "access"`) and refuses the cookie when it does not verify or its `sub` differs from the token's. It also accepts the auth API's access token as `Authorization: Bearer`, as it already did when the pair was configured.
- `req.user.roles` (and `request.user.roles`) is the verified token's `roles` claim, or `[]` when the token has none. It no longer falls back to the roles copied into the cookie from the login response. `permissions`, `organizationRoles`, `organizationPermissions` and `organizationId` come from the verified token too.

What to do when upgrading: pass the same `authServerUrl` and `audience` you give `createSeamlessAuthServer` (or the plugin) to every `requireAuth`, plus `authServerIssuer` if you set one there. The guard fetches the auth API's JWKS once and caches it.
