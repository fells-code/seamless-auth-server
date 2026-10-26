---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Refuse known placeholder secrets at startup. `assertSecretStrength` now refuses
`dev-only-cookie-signing-key-replace-me`, `GRAB_FROM_SEAMLESS_AUTH_PORTAL_DEV`, and any value
containing `replace-me`, which were long enough to pass the length check. Every adapter refuses one
for `cookieSecret` or `serviceSecret` when it starts, unless it runs in its insecure local mode
(`cookieSecure: false`). `assertSecretStrength` takes a new `{ allowPlaceholder }` option and
`assertSecrets` reads `cookieSecure`; core also exports `isPlaceholderSecret` and
`KNOWN_PLACEHOLDER_SECRETS`.

`requireAuth` (and `authenticateRequest`) configured with `authServerUrl` and `audience` now also
verifies the access token inside the cookie against the auth API's JWKS, and takes the session's
roles from it, so a cookie forged with the cookie secret alone cannot carry claims of its own.
Without that configuration the guard decodes the inner token as before.
