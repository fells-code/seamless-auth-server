---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Bind the configured `audience` when verifying signed auth responses. `verifySignedAuthResponse` now enforces the `aud` claim in `jwtVerify`, and the login, finishLogin, finishRegister, OAuth, OTP, magic-link, and switch-organization handlers thread `SeamlessAuthServerOptions.audience` through to it. Previously only the issuer was checked, so on a multi-relying-party auth server a token minted by the same issuer for a different application would pass verification and be accepted as this app's session.
