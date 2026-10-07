---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Verify the access token a silent refresh returns before issuing cookies from it. `ensureCookies` refreshes an expired session on the auth routes and wrote the auth API's response straight into the access cookie, while every other flow that issues a session (login, OTP, OAuth, magic link, and the explicit `/refresh` route) first checks the token against the auth server's JWKS and confirms it names the same user as the body. The access cookie is signed with the application's own secret and its roles are trusted on every later request, so a refresh response that did not come from the auth server could become a trusted session. The silent refresh now runs the same check and answers 401, clearing the session cookies, when it fails. The session id is now read from the signed token's `sid` claim, as the other flows do.

`EnsureCookiesOptions` and the Express `createEnsureCookiesMiddleware` take a new optional `accessTokenAudience`, the audience user access tokens are issued for. The adapters pass their configured `audience`. Code that calls `ensureCookies` or `createEnsureCookiesMiddleware` directly should pass it too; it defaults to `authServerUrl`.
