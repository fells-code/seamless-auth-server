---
"@seamless-auth/core": patch
"@seamless-auth/nextjs": patch
---

`verifyRefreshCookie` accepts only a refresh cookie: a signed payload with a non-empty `sub` and `refreshToken` and no upstream `token`. Every adapter cookie is signed with the same secret, so before this a pre-auth, registration or access cookie placed in the refresh cookie slot verified too, and `hasSeamlessSession` in `@seamless-auth/nextjs` reported a session for it. Refresh cookies issued by earlier versions already have this shape and keep working.
