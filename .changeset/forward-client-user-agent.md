---
'@seamless-auth/core': minor
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Forward the browser's user agent to the auth API, and pass `GET /internal/metrics/sign-ins`
through.

The auth API now records a device class on every audit row (fells-code/seamless-auth-api#306),
folded from the request user agent. The adapter is the only client it sees, so until now every
row carried the adapter's own user agent and the breakdown by device class read `unknown` for
every sign-in. Both adapters now send the browser's `User-Agent` as
`x-seamless-client-user-agent` alongside `x-seamless-client-ip`, on every proxied call. The API
honours it under the same service-token rule as the address. It is trimmed and capped at 512
characters; unlike the address it needs no trust decision, since it is self-reported by the
browser either way.

`authFetch` and every core handler take an optional `forwardedUserAgent`, and the adapters
derive it with `buildForwardedUserAgent(req)`. A caller-built request with no headers is
tolerated, as `getSeamlessUser` accepts one.

The API's new `GET /internal/metrics/sign-ins` (sign-in outcomes per method, device class, mail
provider and owner flag, with where attempts stop) is proxied on an access session the way the
funnel route is, with the `from` and `to` window forwarded and pinned by the query forwarding
tables. Core exports `getSignInMetricsHandler`.
