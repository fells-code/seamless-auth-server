---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Close a form-post CSRF gap on the auth routes (#256). A body-less form `POST` from a sibling subdomain, or from a browser that sends no fetch metadata, could reach cookie-authenticated routes such as `/recovery-codes` when cookies were `SameSite=Lax` or `Strict`.

Requests now refused:

- The origin check runs whatever the `SameSite` setting. A state-changing request with `Sec-Fetch-Site: cross-site` answers `403 {"error":"cross_site_request_blocked"}` under `Lax` and `Strict` too, and `allowedOrigins` is enforced for `same-site` and metadata-free requests under every setting. An empty `allowedOrigins: []` counts as configured. This also applies to the Next.js `requireAuth` and `requireRole` guards.
- A state-changing request to the auth routes must declare `Content-Type: application/json` or carry an `x-seamless-auth-transport` header (any value), even with no body, or it answers `415 {"error":"unsupported_media_type"}`. `POST /refresh`, `DELETE /logout` and `DELETE /logout/all` are exempt for now, because the current browser client sends them bare; they still get the origin check. A client of your own that sends a body-less `POST`, `PUT`, `PATCH` or `DELETE` with no content type must add one of the two.

Fastify accepts an empty body under `Content-Type: application/json` on the plugin's routes, and Express no longer reads one as `{}`, so a body-less JSON request forwards no body on all three adapters.

`checkContentType` is exported from `@seamless-auth/core`. `checkOrigin` ignores its `cookieSecure` and `cookieSameSite` inputs.
