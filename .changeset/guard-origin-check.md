---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
---

Run the origin check in the Express and Fastify `requireAuth` guards, as the Next.js guards and the Go, Python and Rust adapters already do (#256), and refuse a literal `null` `Origin` in every case.

Requests now refused:

- On a cookie session, Express and Fastify `requireAuth` (and so `requireRole` behind it) answer a state-changing request (anything but `GET`, `HEAD` and `OPTIONS`) with `403 {"error":"cross_site_request_blocked"}` when `Sec-Fetch-Site` is `cross-site` or the `Origin` is a literal `null`. A new `allowedOrigins` option, which takes the same list as the auth router, also requires a listed `Origin` for a `same-site` request or one with no `Sec-Fetch-Site`; an empty list is enforced. A bearer request is not checked, and the guards ask for no JSON content type.
- `checkOrigin` refuses a literal `null` `Origin` whatever `Sec-Fetch-Site` and `allowedOrigins` say. It used to pass one sent with `Sec-Fetch-Site: same-origin`, `same-site` or `none`. This applies to the auth routes of every adapter and to the Next.js guards.
