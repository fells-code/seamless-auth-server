---
"@seamless-auth/fastify": patch
---

Detect Fastify proxy trust from its behaviour, not its configuration (#208).

The adapter refused to forward a client-controlled address when `trustProxy` was `true`, by reading `trustProxy` from `initialConfig`. Fastify 5 does not expose it there, so the check never fired, and with `trustProxy: true` a caller could choose the client IP the auth API rate limits and audits against. The adapter now asks Fastify's own `request.ip` about a request from documentation addresses (RFC 5737). When the application trusts every address it drops the client IP and warns, as intended.

The README recommended a hop count, which Fastify 5.12.1 and later ignore: they trust no proxy, so `request.ip` is the proxy and every user shares one address on the auth API. The README now recommends the proxy's address or subnet, or `resolveClientIp`, and the adapter warns once when requests carry `X-Forwarded-For` that nothing trusts.
