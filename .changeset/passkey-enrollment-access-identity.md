---
'@seamless-auth/core': minor
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Passkey enrollment now forwards the access session. This is a coordinated contract
change with `seamless-auth-api`, which refuses a pre-auth token on these routes as of the
matching release.

`/webAuthn/register/start` and `/webAuthn/register/finish` read the registration cookie
and sent the ephemeral token upstream. The auth API mints one of those for an account
that already exists, from an email address alone, so anyone who knew an address could
enroll a credential against the account and sign in as its owner. Both routes now read
the access cookie and forward the access token. `/webAuthn/login/start` and
`/webAuthn/login/finish` are unchanged and still take the pre-auth cookie, because
authenticating is what they are for.

No shipped flow loses a step. Registration proves an address with an email OTP, and
verifying it issues a session, so the client holds an access cookie by the time it offers
a passkey. An application that offered enrollment before verifying an address has to move
that step after it.

Upgrade this and the auth API together. There is no safe order between them: an older
adapter sends the token the new API refuses, and this release sends one an older API
refuses, so enrollment answers `401` until both sides land.

`finishRegisterHandler` no longer issues session cookies. Enrolling a passkey is not a
sign-in, and the caller now arrives holding a session, so minting a second one left the
first live and unrevoked while counting against the API's concurrent session limit, which
can evict the user's other devices. The route still answers `204`.

`FinishRegisterOptions` drops `audience`, `cookieDomain`, `accessCookieName` and
`refreshCookieName`, and `FinishRegisterResult` drops `setCookies`. Only the two adapters
in this workspace passed them, and both are updated. Code calling
`finishRegisterHandler` directly should pass `{ authServerUrl }` alone.

This does not change the pre-auth routes' silent refresh, which still mints an access
token into a cookie those routes cannot use. That is tracked separately.
