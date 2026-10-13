---
"@seamless-auth/core": patch
---

Depend on `@types/jsonwebtoken` at runtime instead of as a dev dependency. The published declarations import `JwtPayload` from `jsonwebtoken` (for example in `verifyCookieJwt`), so consumers without their own copy got `TS7016` under `skipLibCheck: false` and an `any` payload type otherwise.
