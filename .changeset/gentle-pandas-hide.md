---
'@seamless-auth/core': minor
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Stop repeating the session credentials in the body of the response that sets them as
cookies.

Five handlers that issue session cookies returned the upstream body unchanged, and that body
carries the access token and the refresh token, because it is the same body
`issueSessionCookies` reads them out of to build the cookies. So every completed sign-in
answered with `Set-Cookie: httpOnly` and then handed the same two values to the caller as
JSON.

The `httpOnly` flag exists to keep those tokens out of reach of page scripts. A response body
is not: it is readable by anything that can see the response, and it reaches places a cookie
does not, including a devtools or HAR export shared while debugging, a service worker, a
browser extension with request access, an APM tool that records payloads, and a proxy
configured to log bodies. The refresh token is the durable session credential, so it is the
half that matters.

`finishRegisterHandler` already had this right, answering `204` with no body at all. The five
that did not are `finishLoginHandler`, `verifyLoginOtpHandler`, `finishOAuthLoginHandler`,
`pollMagicLinkConfirmationHandler` and `switchOrganizationHandler`.

Only `token` and `refreshToken` are removed, by one exported helper rather than five copies,
so the handlers cannot drift apart on it again. Everything callers actually read survives:
`message`, `sub`, `email`, `roles`, `phone`, `organizationId`, `ttl`, `refreshTtl` and
`returnTo`. The cookies are unchanged, so sessions work exactly as before.

Nothing in `@seamless-auth/react` reads either field off a response, and its result types
already declare them absent, with the comment that sessions are carried by cookies so
adopters have no reason to handle raw tokens. An adopter reading `token` or `refreshToken`
directly off one of these responses, against that guidance, no longer can.
