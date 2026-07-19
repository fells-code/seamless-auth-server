---
"@seamless-auth/express": patch
---

Drive cookie `Secure` and `SameSite` from explicit adapter options instead of ambient `NODE_ENV`.

Session cookies previously only got `Secure` and `SameSite=None` when `process.env.NODE_ENV === "production"`, so a production deploy that forgot to set `NODE_ENV` shipped session cookies over plaintext HTTP with a weaker CSRF posture.

`createSeamlessAuthServer` and `createEnsureCookiesMiddleware` now accept:

- `cookieSecure?: boolean`, defaulting to `true`
- `cookieSameSite?: "lax" | "none" | "strict"`, defaulting to `none` when secure and `lax` otherwise

Cookies are now secure by default in every environment. Set `cookieSecure: false` for local HTTP development. If you relied on the old behavior to develop over plain HTTP without setting `NODE_ENV=production`, add `cookieSecure: false` to your local configuration.
