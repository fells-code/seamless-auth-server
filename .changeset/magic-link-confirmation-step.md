---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Support the magic link confirmation step.

`GET /magic-link/verify/:token` now sends the opening browser's pre-auth session to the auth API
when it has one: the token from the signed pre-auth cookie in cookie transport, or the client's
`Authorization` header in bearer transport. The auth API uses it to recognise the device that asked
for the link. A browser without one, or with a cookie that no longer verifies, is still answered and
never gets a 401 from the adapter.

When the auth API (0.19.0 and later) asks for confirmation, verify answers
`409 { error: "confirmation_required", message, requestedFrom: { deviceClass, requestedAt } }`
unchanged, and `POST /magic-link/verify/:token/confirm` approves the sign-in. The confirm route is
served from the adapter manifest, and the bundled fallback manifest now lists it. It is a state
change, so the cross-site request guard applies to it.

`verifyMagicLinkHandler` takes an optional `authorization`, and core exports
`magicLinkVerifyAuthorization` to build it. All three adapters now verify through the core handler,
so a verify failure the auth API sends with an empty body is answered as
`{ error: "upstream_error" }` instead of a bare status.
