---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Check `Origin` against `allowedOrigins` even when `Sec-Fetch-Site` is present. A `same-site`
request also covers sibling subdomains, so with `SameSite=None` cookies the header alone let any
subdomain drive a state change. When `allowedOrigins` is configured, a state-changing `same-site`
request must now carry an `Origin` on the list (a missing `Origin` is refused). `same-origin`
requests always pass and `cross-site` requests are always refused.

This tightens behavior for adopters who set `allowedOrigins`: list every origin that calls the
adapter from a sibling subdomain. With `allowedOrigins` unset the default is unchanged, and a
`same-site` request passes as before.
