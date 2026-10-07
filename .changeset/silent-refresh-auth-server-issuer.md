---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Check a silently refreshed access token against `authServerIssuer`. The silent refresh in `ensureCookies` now verifies the token it returns, but it checked `iss` against `authServerUrl` even when `authServerIssuer` was set, so an app reaching the auth server at another URL (the local Docker stack from the host) answered 401 on every silent refresh and signed the user out. `EnsureCookiesOptions` and the Express `createEnsureCookiesMiddleware` take an optional `authServerIssuer`, and the adapters pass their configured one.
