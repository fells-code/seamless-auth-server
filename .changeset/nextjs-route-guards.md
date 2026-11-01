---
"@seamless-auth/nextjs": minor
"@seamless-auth/core": minor
---

Next.js: add `requireAuth(handler, options)` and `requireRole(roles, handler, options)` to guard App Router route handlers. They accept the access cookie or the auth API's access token in `Authorization: Bearer`, verify the token against the auth API's key set (so roles come from a token the API signed), refuse recovery sessions unless `allowRecoverySession` is set, apply the origin check to cookie requests, and never refresh. Refusals answer `401 {"error":"unauthenticated"}`, `403 {"error":"enrollment_required"}`, `403 {"error":"cross_site_request_blocked"}` or `403 {"error":"insufficient_role"}`, without naming any roles. The user handed to the route carries `organizationId` from the token's `org_id`. A role guard with no roles throws at setup.

Next.js: add a `trustedProxies` option (addresses or CIDR ranges) that reads the client IP from `X-Forwarded-For`, walking from the right past your proxies, when `resolveClientIp` is not given. Nothing is forwarded when neither is set, as before, but the handler now logs one warning at startup saying so. `getSeamlessSession` takes the request `headers` with `trustedProxies` or `resolveClientIp` and forwards the client IP, and reads the user agent from them when `userAgent` is not given.

Core: `authenticateBearer` and `authenticateRequest` (with bearer verification on) set `organizationId` on the user from the verified access token's `org_id`. The new `GuardUser` type describes it.
