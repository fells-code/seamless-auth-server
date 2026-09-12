---
'@seamless-auth/core': minor
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Pass `GET /internal/metrics/funnel` through to the auth API.

The auth API gained a funnel endpoint (time to registration, time to login, passkey
adoption and time to first passkey, each with the count it was computed over) and
the admin dashboard reads it through the adapter. Neither adapter forwarded it, so
the dashboard's new Overview section would have answered with the adapter's own 404.

Both adapters now proxy it on an access session the way the neighbouring
`/internal/metrics/dashboard` route is proxied, and forward the `from` and `to`
window, which is pinned by the query forwarding table so a route that drops its
query cannot ship again. Core exports `getFunnelMetricsHandler` alongside the other
internal metrics handlers.
