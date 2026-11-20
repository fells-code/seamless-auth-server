---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Tighten cross-site request protection when no `allowedOrigins` list is configured, and default the auth cookies to `SameSite=Lax`.

Behaviour changes:

- Without `allowedOrigins`, a state-changing request that is `Sec-Fetch-Site: same-site`, or that carries an `Origin` and no `Sec-Fetch-Site` (or `none`), must come from an `Origin` whose host equals the request's `Host`. It used to pass, so a page on a sibling subdomain could send a request that carried the session cookie. A `same-site` request with no `Origin` is now refused. Refusals answer `403 {"error":"cross_site_request_blocked"}`. This applies to the auth routes and to the `requireAuth` and role guards on cookie sessions.
- A `Sec-Fetch-Site` value the Fetch Metadata spec does not define is treated as cross-site and refused.
- `cookieSameSite` now defaults to `lax` whatever `cookieSecure` says. It used to default to `none` when the cookie was secure.
- `checkOrigin` in core takes a new `host` input. Without `allowedOrigins`, a caller that leaves it out has every request with a non-same-origin `Origin` refused.

Express and Fastify read the host from `req.host`, which follows `X-Forwarded-Host` only behind a proxy the framework is told to trust (`trust proxy`, `trustProxy`). Next.js reads the `Host` header.

What to do when upgrading: if your browser app is served from a different host than the adapter, or a proxy in front of the adapter rewrites `Host`, set `allowedOrigins` to the origins your app is served from (or configure the framework to trust the proxy). If your browser app is on a different site from the adapter, set `cookieSameSite: "none"` (with `cookieSecure` left on) to keep the cookie on its requests.
