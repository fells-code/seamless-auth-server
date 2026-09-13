---
'@seamless-auth/core': minor
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Serve a bearer transport on the auth routes for native clients, and add `POST /refresh`.

Every proxied route assumed cookies: identity came from the cookie payload, session responses
were stripped of their tokens and minted into cookies, and silent refresh ran on the refresh
cookie. A native app has no cookie jar, so it could not sign in through the adapter at all, and
going around it to the auth API directly would bypass message delivery, client IP forwarding,
and the service token, and need the auth API exposed.

A request that carries `x-seamless-auth-transport: bearer` now gets a bearer contract on the
same routes. The client presents the token a route needs in `Authorization: Bearer` (the
ephemeral token `/login` or `/registration/register` returned on pre-auth routes, the access
token on access routes) and the adapter forwards it to the auth API as-is. Session-issuing
responses come back whole, `token` and `refreshToken` included, with no `Set-Cookie`; the auth
API's signature on the access token is still verified before the body goes out. `ensureCookies`
is skipped. A route that needs an identity and gets no bearer token answers 401 with the same
error it gives a missing cookie. The header rather than the presence of `Authorization` selects
the transport, because the first request of a flow carries no token in either. Requests without
the header are served exactly as before.

`POST /refresh` is new in both adapters. In bearer transport it takes `Authorization: Bearer
<refreshToken>` and returns the rotated pair, passing the auth API's failure body through so a
client can tell `refresh_token_reused` from a transient error. Concurrent rotations of the same
token are collapsed into one upstream call, since the auth API treats a replayed refresh token as
theft. In cookie transport it rotates the refresh cookie into fresh session cookies, for a client
that wants an explicit refresh.

Core: `AuthTransport`, `resolveAuthTransport`, `AUTH_TRANSPORT_HEADER`, `sessionResult` (what
every session-issuing handler now returns through), a `transport` option on `loginHandler`,
`registerHandler`, `finishLoginHandler`, the OTP verify handlers,
`pollMagicLinkConfirmationHandler`, `switchOrganizationHandler` and `finishOAuthLoginHandler`,
`transport` and `authorization` on `checkProxyIdentity`, `transport` on `applyResult`,
`refreshBearerSession`, and `refreshHandler`. The parity suite drives a full bearer sign-in
through both adapters.

Closes fells-code/seamless-auth-server#163.
