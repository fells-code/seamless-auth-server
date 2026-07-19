---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Move secret strength validation into the core and apply it to every entry point that accepts a secret.

The 32 character minimum on `cookieSecret` and `serviceSecret` previously only guarded
`createSeamlessAuthServer` and `createEnsureCookiesMiddleware` in the Express adapter, so an adopter
calling a core function or `requireAuth` directly got no protection.

`@seamless-auth/core` now owns the check and exports `MIN_SECRET_LENGTH`, `assertSecretStrength`,
and `assertSecrets`. It runs in `ensureCookies`, `refreshAccessToken`, `getSeamlessUser`, and
`createServiceToken`. The Express adapter re-uses the core implementation and adds it to
`requireAuth`, which previously only checked that `cookieSecret` was present.

`verifyCookieJwt` and `verifyRefreshCookie` are deliberately unchanged. They are low-level
primitives with a documented "return `null` on failure" contract, and every code path in these
packages that reaches them validates the secret first.

Adopters passing a secret shorter than 32 characters to any of these functions will now get a thrown
error naming the option. Generate replacements with a CSPRNG, for example `openssl rand -base64 48`.
