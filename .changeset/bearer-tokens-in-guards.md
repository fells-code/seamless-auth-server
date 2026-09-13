---
'@seamless-auth/core': minor
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Accept the auth API's access token as a bearer credential in `requireAuth` and `getSeamlessUser`.

Both guards read `req.cookies` and nothing else, so a native client, which has no cookie jar
and holds the auth API's own tokens, was rejected on every request to an adopter's routes.
`requireAuth` now takes an optional `authServerUrl` + `audience` pair; with both configured it
also accepts `Authorization: Bearer <access token>`, verified against the auth API's JWKS
(issuer, audience, expiry) and required to carry `typ: "access"`, so a sign-in flow's
ephemeral token is refused even though the same key signs it. The cookie wins when both are
present, and leaving the pair out keeps the guard cookie-only, which is what every earlier
version did. Half of the pair is a setup error.

`getSeamlessUser` resolves a bearer session too. The router options already carry
`authServerUrl` and `audience`, so no new option is needed there: a request with no access
cookie but a valid bearer token is verified the same way and forwarded to `GET /users/me` as
the caller's identity, while a request with neither, or a token that fails verification,
returns `null` without an upstream call.

On the bearer path `req.user.email` and `req.user.phone` are unset, because the access token
does not carry them; `getSeamlessUser` hydrates the profile.

Core exports `verifyAccessToken`, `extractBearerToken`, `authenticateBearer`, and
`authenticateRequest`. `getSeamlessUser` in core takes an optional `bearer: { authorization,
audience }`. The JWKS memo that `verifySignedAuthResponse` used moves to a shared module so both
verifiers share one instance per auth server. Fastify gains direct tests for its guards, which
until now were covered only through the plugin parity suite.

Tracks fells-code/seamless-auth-server#147.
