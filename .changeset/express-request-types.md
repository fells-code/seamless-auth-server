---
"@seamless-auth/express": patch
---

Ship the `Express.Request` augmentation. `req.user` (set by `requireAuth`) and `req.cookiePayload` (set by `createEnsureCookiesMiddleware`) now typecheck in a consumer that imports the package, without declaring the augmentation itself. It previously lived in an ambient `.d.ts` that tsc never copied into `dist`.
