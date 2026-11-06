---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Add `requirePermission` guards, organization aware, on Express, Fastify and Next.js (#218). Needs the auth API at v0.23. `match` is `any` or `all`, `organization: true` counts only the active organization's permissions, and `organizationParam` also binds the check to the organization a route names. Matching is exact. A refusal is `403 insufficient_permission`, and an empty list opens nothing. A token carrying `permissions_omitted` has its permissions read from `GET /users/me/permissions` at the configured auth server URL, and `503 permissions_unavailable` fails closed when that read fails. The URL comes from `requireAuth`, or from an `authServerUrl` option for a cookie-only `requireAuth`.

The guarded user now carries `permissions`, `organizationRoles`, `organizationPermissions` and `permissionsOmitted`. Core exports `authorizePermissions`, `permissionRequirement`, `INSUFFICIENT_PERMISSION` and `PERMISSIONS_UNAVAILABLE`, and every package exports `hasPermission` and `hasAllPermissions`.

Resource servers gain the same guard: `api.requirePermission` on Express and Fastify, `permissions` and `permissionOptions` requirements on Next.js, and `authorizePermissions` on the verifier. Provider tokens do not carry these claims until seamless-auth-oidc-provider#47, so it denies every provider token today. `permissions_omitted` there is a 403, not a live read.
