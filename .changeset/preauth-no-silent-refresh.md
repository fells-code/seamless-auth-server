---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Stop silently refreshing a route that needs a pre-auth or registration cookie. When `/webAuthn/login/start`, `/webAuthn/login/finish` or another pre-auth or registration route was called without its cookie, `ensureCookies` spent the refresh token and wrote the resulting access token under that route's cookie name. The next attempt then forwarded an access token to a route the auth API gates on an ephemeral token, and passkey login answered 401 (`JWT typ mismatch`). Such a route now answers 401 without touching the refresh cookie, since a refresh can only produce an access token. Fixes #154.
