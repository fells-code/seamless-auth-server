---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Serve a proxied access route on the same request that silently refreshed the session. When a cookie-transport request carried only the refresh cookie, `ensureCookies` refreshed the session but `checkProxyIdentity` still looked for the access cookie on the incoming request and answered 401 `access session required`, so the first request after the access cookie expired failed and only the retry worked. A session refreshed earlier in the request now satisfies the `access` identity, for passthrough routes and manifest routes in Express, Fastify and Next.js. A refreshed session still never stands in for a pre-auth or registration cookie. The `user` that `ensureCookies` returns carries `refreshed: true` after a silent refresh.
