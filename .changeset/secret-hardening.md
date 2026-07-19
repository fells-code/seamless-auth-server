---
"@seamless-auth/express": patch
---

Validate secret strength at startup, warn on the dev JWKS key id, and stop logging the cookie payload.

`cookieSecret` and `serviceSecret` were only checked for presence, so a short secret could be brute
forced offline and used to forge cookie sessions and service tokens. Both are now required to be at
least 32 characters. `createSeamlessAuthServer` and `createEnsureCookiesMiddleware` throw with a
clear message when a secret is missing or too short.

This is a behavior change at startup: a deployment running with a weak secret will now fail fast
instead of starting. Generate replacements with a CSPRNG, for example `openssl rand -base64 48`.

`jwksKid` still defaults to `dev-main`, but the adapter now logs a warning when the default is used
so an unconfigured key id is visible in production logs.

`createSeamlessAuthServer` no longer passes `req.cookiePayload` to `console.warn` when a request is
missing its session subject. The payload could contain `token`, `sub`, and `roles`.
