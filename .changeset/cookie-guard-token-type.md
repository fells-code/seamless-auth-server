---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Accept only a session cookie in `requireAuth` and the Next.js session helpers.

Every adapter cookie is signed with the same secret, including the pre-auth cookie `POST /login` issues for any existing account from its email address alone, and the registration cookie. `authenticateCookie` checked only the signature and `sub`, so one of those cookies presented under the access cookie name passed `requireAuth` (Express and Fastify) and `getSeamlessSession`, `getSeamlessClaims` and `hasSeamlessSession` (Next.js) as that account, without a factor being proven. A refresh cookie passed the same way. Routes the adapter proxies to the auth API were not affected, because the API checks the token's type itself.

`authenticateCookie` now also requires the cookie to carry an auth API access token (`typ: "access"`). Session cookies issued by earlier versions already carry one, so signed-in users are not signed out. Upgrade if any of your own routes rely on these guards.
