# @seamless-auth/fastify

## 0.11.1

### Patch Changes

- 88ae99c: Detect Fastify proxy trust from its behaviour, not its configuration (#208).

  The adapter refused to forward a client-controlled address when `trustProxy` was `true`, by reading `trustProxy` from `initialConfig`. Fastify 5 does not expose it there, so the check never fired, and with `trustProxy: true` a caller could choose the client IP the auth API rate limits and audits against. The adapter now asks Fastify's own `request.ip` about a request from documentation addresses (RFC 5737). When the application trusts every address it drops the client IP and warns, as intended.

  The README recommended a hop count, which Fastify 5.12.1 and later ignore: they trust no proxy, so `request.ip` is the proxy and every user shares one address on the auth API. The README now recommends the proxy's address or subnet, or `resolveClientIp`, and the adapter warns once when requests carry `X-Forwarded-For` that nothing trusts.

## 0.11.0

### Minor Changes

- 7f2e490: Serve auth API routes from the adapter manifest (#201).

  The auth API publishes which token each route takes and which tokens its response issues or clears at `/.well-known/seamless-adapter.json`. Every adapter now serves any route listed there that it has no handler of its own for, so a new API route works without a new release of these packages. Routes with their own handlers behave as before.

  - Routes that had no passthrough now work: TOTP sign-in (`POST /totp/verify-login`), `POST /registration/phone` and `/registration/phone/verify`, `POST /admin/users/import`, and anything the API adds later.
  - `@seamless-auth/nextjs` returns a `PUT` handler, so the OAuth provider retirement routes are reachable. Export it from the catch-all route: `export const { GET, POST, PUT, PATCH, DELETE } = createSeamlessAuthHandler(...)`.
  - Fastify serves manifest routes whatever their path casing, as Express and Next.js already did.
  - Routes served from the manifest never return `token` or `refreshToken` to the browser in cookie transport.
  - `ensureCookies` takes optional `method` and `manifest`, and then loads the cookie the manifest names for the route.
  - Core exports `createAdapterManifestSource`, `matchManifestRoute`, `handleManifestRoute`, `parseAdapterManifest`, `buildManifestPath` and `ADAPTER_MANIFEST_PATH`.

  Each adapter fetches the manifest from the auth API on its first request, waiting up to five seconds, and keeps it for the life of the process. If the API does not serve one (versions before the manifest), it uses the copy bundled with the package and tries again a minute later. Tests that mock `fetch` will see this extra request; pass `fetchManifest: false` to use only the bundled copy.

### Patch Changes

- a16f216: Accept only a session cookie in `requireAuth` and the Next.js session helpers.

  Every adapter cookie is signed with the same secret, including the pre-auth cookie `POST /login` issues for any existing account from its email address alone, and the registration cookie. `authenticateCookie` checked only the signature and `sub`, so one of those cookies presented under the access cookie name passed `requireAuth` (Express and Fastify) and `getSeamlessSession`, `getSeamlessClaims` and `hasSeamlessSession` (Next.js) as that account, without a factor being proven. A refresh cookie passed the same way. Routes the adapter proxies to the auth API were not affected, because the API checks the token's type itself.

  `authenticateCookie` now also requires the cookie to carry an auth API access token (`typ: "access"`). Session cookies issued by earlier versions already carry one, so signed-in users are not signed out. Upgrade if any of your own routes rely on these guards.

- 5274afe: Keep ephemeral tokens out of cookie-transport response bodies (#202).

  The OTP send routes (`POST /otp/generate-email-otp`, `/otp/generate-phone-otp`, `/otp/generate-login-email-otp`, `/otp/generate-login-phone-otp`) returned the ephemeral token the auth API re-mints on every send, and `POST /registration/register` returned the registration token it had just stored in the cookie. Page scripts could read both, which the httpOnly cookie exists to prevent. Under cookie transport these bodies no longer carry `token` or `refreshToken`. Bearer transport is unchanged, because the client holds its own tokens there.

  `requestOtpHandler` takes an optional `transport`. Without it the token is dropped, so a caller serving bearer clients through this handler directly should pass `transport: "bearer"`.

- 330c0fc: Accept the session cookie on application routes outside the Fastify plugin (#207).

  The Fastify plugin registers `@fastify/cookie` inside its own encapsulated scope, so a route the application registers elsewhere had no `request.cookies`. `requireAuth` answered 401 to every cookie session there, although the README presents it for exactly those routes, and `getSeamlessUser` found no session either. Both now read the `Cookie` header themselves when no cookie plugin parsed it.

  `getSeamlessUser` in core also sends the access token from the verified cookie when the caller supplies no `authorization`. Before, a cookie session read outside the adapter's own routes, with no guard in front to load the cookie payload, reached the auth API with no token. This applies to the Express adapter as well.

- Updated dependencies [7f2e490]
- Updated dependencies [a16f216]
- Updated dependencies [5274afe]
- Updated dependencies [330c0fc]
- Updated dependencies [d285ffb]
  - @seamless-auth/core@0.20.0

## 0.10.1

### Patch Changes

- 0314dfa: Check a silently refreshed access token against `authServerIssuer`. The silent refresh in `ensureCookies` now verifies the token it returns, but it checked `iss` against `authServerUrl` even when `authServerIssuer` was set, so an app reaching the auth server at another URL (the local Docker stack from the host) answered 401 on every silent refresh and signed the user out. `EnsureCookiesOptions` and the Express `createEnsureCookiesMiddleware` take an optional `authServerIssuer`, and the adapters pass their configured one.
- ca8fa4a: Verify the access token a silent refresh returns before issuing cookies from it. `ensureCookies` refreshes an expired session on the auth routes and wrote the auth API's response straight into the access cookie, while every other flow that issues a session (login, OTP, OAuth, magic link, and the explicit `/refresh` route) first checks the token against the auth server's JWKS and confirms it names the same user as the body. The access cookie is signed with the application's own secret and its roles are trusted on every later request, so a refresh response that did not come from the auth server could become a trusted session. The silent refresh now runs the same check and answers 401, clearing the session cookies, when it fails. The session id is now read from the signed token's `sid` claim, as the other flows do.

  `EnsureCookiesOptions` and the Express `createEnsureCookiesMiddleware` take a new optional `accessTokenAudience`, the audience user access tokens are issued for. The adapters pass their configured `audience`. Code that calls `ensureCookies` or `createEnsureCookiesMiddleware` directly should pass it too; it defaults to `authServerUrl`.

- Updated dependencies [0314dfa]
- Updated dependencies [ca8fa4a]
  - @seamless-auth/core@0.19.1

## 0.10.0

### Minor Changes

- a004f89: Pass the auth API's audit and reporting routes through with the caller's access identity: `GET /admin/auth-events/integrity` (fells-code/seamless-auth-api#174), `GET /admin/auth-events/export` (fells-code/seamless-auth-api#173) and `GET /admin/reports/authentication-coverage` (fells-code/seamless-auth-api#178), each with its query.

  The export and the coverage report answer with a file (NDJSON, or CSV when `format=csv`), so proxied routes can now forward an upstream response unparsed. `proxyRequest` takes `raw: true` and returns `raw: { headers, body }`, holding the body stream and its `content-type`, `content-disposition` and `cache-control`. Each adapter streams it through as is, so the download keeps its type and filename rather than arriving wrapped in `{ message }`.

  `ResponseAdapter` gains a required `sendRaw(status, raw)`. A custom adapter that implements `ResponseAdapter` itself has to add it. The adapters in this repository already do.

  `@seamless-auth/types` is now `^0.27.0`.

- 79aad32: Add `authServerIssuer`, the expected `iss` of the tokens and signed responses the auth server returns. It defaults to `authServerUrl`, so nothing changes unless you set it. Set it when the auth server is reached at a different URL from the issuer it advertises: on the local Docker stack the auth server signs as `http://auth:5312`, while an app run on the host calls `http://localhost:5312`, and every sign-in failed with `Invalid signed response from Auth Server` (fells-code/seamless-cli#224). Requests and key set fetches still go to `authServerUrl`; only the `iss` check reads the new option.

  The auth API sets `aud` to its ISSUER as well, and `audience` stays required with no default, so with `authServerIssuer` set, set `audience` to the same value. For the Docker stack from the host that is `authServerUrl: "http://localhost:5312"`, `authServerIssuer: "http://auth:5312"`, `audience: "http://auth:5312"`. The option docs and READMEs now say this.

  It is accepted by `createSeamlessAuthServer`, `requireAuth` and `getSeamlessUser` in Express, the `seamlessAuth` plugin, `requireAuth` and `getSeamlessUser` in Fastify, and `createSeamlessAuthHandler` and `getSeamlessSession` in Next.js. In core, `verifySignedAuthResponse`, `verifyAccessToken` and `verifyUpstreamSession` take it as an optional last argument, and `getSeamlessUser`, `authenticateBearer`, `authenticateRequest` (under `bearer`), `issueSessionCookies`, `sessionResult` and the session-issuing handlers' options take it as a field (`AuthServerIssuerOption`).

  The startup warning for an unset or `dev-main` `jwksKid` now says what the value is: the `kid` header on the HS256 service tokens the adapter signs with `serviceSecret`, not the auth server's signing key. The READMEs describe `jwksKid` the same way.

- 629c428: - `GET /internal/metrics/dashboard` and `GET /internal/security/anomalies` now forward their query string, so the time range and paging the auth API accepts on them reach it (fells-code/seamless-auth-api#132). Before, both handlers were built without a query, and a range from the dashboard was silently dropped. `getDashboardMetricsHandler` and `getSecurityAnomaliesHandler` accept `query`.
  - Pass `GET /admin/review-accounts` (with its `days` query) through to the auth API with the caller's access identity (fells-code/seamless-auth-api#331).

### Patch Changes

- 9dbd345: Recover when the auth server starts signing with a new key under the same `kid`. The cached key set was only refetched for an unknown `kid`, so after such a change (a recreated local auth container regenerates its dev key this way) every signed auth response and Bearer token failed verification for up to 10 minutes, and sign-in answered 500 until the application restarted. A signature that does not match a cached key now refetches the key set once and verifies again, at most once per 30 second cooldown so a stream of bad signatures cannot hammer the JWKS endpoint. The verification failure log now includes the `jose` error code. Fixes #184.
- da7f33f: Support Node 22 and newer. The `engines` field now requires `>=22` instead of `>=24 <25`, and CI runs on Node 22, 24, and the latest release (fells-code/seamless-auth-api#339).
- Updated dependencies [a004f89]
- Updated dependencies [79aad32]
- Updated dependencies [9dbd345]
- Updated dependencies [da7f33f]
- Updated dependencies [629c428]
- Updated dependencies [4006a5b]
  - @seamless-auth/core@0.19.0

## 0.9.0

### Minor Changes

- b7d40bb: Pass `GET /admin/enrollment` (with its query) and `POST /admin/enrollment/invites` through to the auth API with the caller's access identity. They report passkey enrollment progress and send enrollment invites (fells-code/seamless-auth-api#338).

### Patch Changes

- 2c626a9: Stop silently refreshing a route that needs a pre-auth or registration cookie. When `/webAuthn/login/start`, `/webAuthn/login/finish` or another pre-auth or registration route was called without its cookie, `ensureCookies` spent the refresh token and wrote the resulting access token under that route's cookie name. The next attempt then forwarded an access token to a route the auth API gates on an ephemeral token, and passkey login answered 401 (`JWT typ mismatch`). Such a route now answers 401 without touching the refresh cookie, since a refresh can only produce an access token. Fixes #154.
- Updated dependencies [daaffbc]
- Updated dependencies [b7d40bb]
- Updated dependencies [2c626a9]
  - @seamless-auth/core@0.18.0

## 0.8.0

### Minor Changes

- 0e78e53: Pass `PUT` and `DELETE /admin/organizations/:organizationId/oauth-providers/:providerId/retirement` through to the auth API with the caller's access identity. They retire an OAuth provider for one organization during a migration cutover and restore it for a rollback (fells-code/seamless-auth-api#337). The Fastify proxy route table now accepts `PUT`.
- e0cab5c: Relicense from AGPL-3.0-only to the Apache License, Version 2.0 (fells-code/seamless-auth-api#335). The `LICENSE` file, the `license` field and the license header in source files now say Apache-2.0, and the AGPL summary in `LICENSE.md` is removed.

### Patch Changes

- Updated dependencies [e0cab5c]
  - @seamless-auth/core@0.17.0

## 0.7.1

### Patch Changes

- 652881e: Pass `DELETE /users/delete` through, so the SDK's `deleteUser()` reaches the auth API.

  The client SDK has always sent `DELETE /users/delete` to delete the signed-in user's own account,
  and the auth API has always served it, but neither adapter registered the route: the call answered
  the adapter's own 404 through `@seamless-auth/express` and the Fastify plugin alike. Nothing built
  on the SDK could delete an account, which both app stores require.

  Both adapters now forward it with the caller's credential. In cookie transport a successful
  deletion clears the access, refresh and pre-auth cookies the way `/logout` does, since the account
  they named no longer exists and the silent refresh would otherwise try to renew a session that is
  gone; a refused deletion leaves them alone. In bearer transport the auth API's body passes through
  and the client clears its own tokens, as it already does on that call. `deleteAccountHandler` is
  exported from `@seamless-auth/core` for adapters built on it.

- Updated dependencies [652881e]
  - @seamless-auth/core@0.16.1

## 0.7.0

### Minor Changes

- 36d530b: Accept the auth API's access token as a bearer credential in `requireAuth` and `getSeamlessUser`.

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

- 0222376: Serve a bearer transport on the auth routes for native clients, and add `POST /refresh`.

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

### Patch Changes

- Updated dependencies [36d530b]
- Updated dependencies [0222376]
  - @seamless-auth/core@0.16.0

## 0.6.0

### Minor Changes

- c961282: Forward the browser's user agent to the auth API, and pass `GET /internal/metrics/sign-ins`
  through.

  The auth API now records a device class on every audit row (fells-code/seamless-auth-api#306),
  folded from the request user agent. The adapter is the only client it sees, so until now every
  row carried the adapter's own user agent and the breakdown by device class read `unknown` for
  every sign-in. Both adapters now send the browser's `User-Agent` as
  `x-seamless-client-user-agent` alongside `x-seamless-client-ip`, on every proxied call. The API
  honours it under the same service-token rule as the address. It is trimmed and capped at 512
  characters; unlike the address it needs no trust decision, since it is self-reported by the
  browser either way.

  `authFetch` and every core handler take an optional `forwardedUserAgent`, and the adapters
  derive it with `buildForwardedUserAgent(req)`. A caller-built request with no headers is
  tolerated, as `getSeamlessUser` accepts one.

  The API's new `GET /internal/metrics/sign-ins` (sign-in outcomes per method, device class, mail
  provider and owner flag, with where attempts stop) is proxied on an access session the way the
  funnel route is, with the `from` and `to` window forwarded and pinned by the query forwarding
  tables. Core exports `getSignInMetricsHandler`.

- 0cd7783: Pass `GET /internal/metrics/funnel` through to the auth API.

  The auth API gained a funnel endpoint (time to registration, time to login, passkey
  adoption and time to first passkey, each with the count it was computed over) and
  the admin dashboard reads it through the adapter. Neither adapter forwarded it, so
  the dashboard's new Overview section would have answered with the adapter's own 404.

  Both adapters now proxy it on an access session the way the neighbouring
  `/internal/metrics/dashboard` route is proxied, and forward the `from` and `to`
  window, which is pinned by the query forwarding table so a route that drops its
  query cannot ship again. Core exports `getFunnelMetricsHandler` alongside the other
  internal metrics handlers.

### Patch Changes

- Updated dependencies [c961282]
- Updated dependencies [0cd7783]
  - @seamless-auth/core@0.15.0

## 0.5.0

### Minor Changes

- ef5989f: Pass `DELETE /admin/organizations/:organizationId` through to the auth API.

  The auth API gained an organization delete route, and neither adapter forwarded it,
  so a dashboard or backend calling through the adapter got a 404 from the adapter's
  own router rather than reaching the API at all. Both adapters now proxy it with the
  access identity, the same way the neighbouring organization routes are proxied.

  `GET /admin/organizations` needed no adapter change. Both adapters already forward
  the query string, so the `limit`, `offset` and `search` parameters the API added
  alongside the delete route reach it without one.

  Requires an auth API that serves the route. Calling it against an older API returns
  that API's 404, so the adapters can ship first and there is no lockstep requirement
  in either direction.

- 9e9afb2: Forward the query string on the two routes that dropped it.

  `GET /admin/users` and `GET /internal/auth-events/login-stats` were built without
  a query, so both adapters called the auth API with a bare path. Every other route
  that reads query parameters forwarded them, which is what made these two hard to
  notice: the endpoints answered `200` with the wrong page or the wrong window, and
  nothing reported an error.

  The visible effect was that the admin dashboard's user search and paging did
  nothing. It sent `?search=...&limit=10&offset=N`, the adapter forwarded
  `/admin/users`, and the API answered with its default first 50 users. The login
  statistics panel ignored its time range the same way, so the range control on the
  Security screen moved the other panels and not that one.

  `getUsersHandler` and `getLoginStatsHandler` in `@seamless-auth/core` now take an
  optional `query` like the other list handlers. The change is additive for anyone
  calling them directly, and both adapters pass the incoming query through.

  Adopters should expect requests to start reaching the API as sent. A caller that
  was relying on the dropped window will now get the page it actually asked for
  rather than the API's default, and a query the API rejects now surfaces as a
  `400` instead of being silently discarded.

  Both adapters are now held to one table of every query-carrying route, so a route
  added without forwarding its query fails a test rather than shipping quiet.

- 485f37b: Passkey enrollment now forwards the access session. This is a coordinated contract
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

### Patch Changes

- Updated dependencies [9e9afb2]
- Updated dependencies [485f37b]
  - @seamless-auth/core@0.14.0

## 0.4.0

### Minor Changes

- e24dd78: Stop repeating the session credentials in the body of the response that sets them as
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

- fb5c039: Forward a magic link destination to the auth API.

  `seamless-auth-api` now accepts an optional `redirectUri` on `GET /magic-link`,
  deciding where the emailed link lands. Until now the adapters called that route with
  no query, so the feature was reachable only by a backend calling the API directly. A
  browser or mobile client could not use it, which was most of the point: a tenant with
  both a web app and a mobile app needs each to receive a link that opens in the right
  place.

  `RequestMagicLinkInput` gains an optional `redirectUri`, and both adapters read it
  from the request body of their own `POST /magic-link` and pass it through. Omit it and
  nothing changes: the upstream URL is exactly what it was, so no adopter has to do
  anything.

  The adapters forward the value rather than checking it. The auth API validates it
  against the configured origins and answers `400` if it is not allowed, and an
  allowlist that lives in two places is one that eventually disagrees with itself. A
  value that is not a string is dropped rather than coerced, so it cannot turn into a
  query parameter meaning something the caller did not send.

  Requires an auth API that understands the parameter. Against an older one the
  parameter is ignored and the link keeps the tenant-wide destination, which is the
  behaviour adopters have today.

### Patch Changes

- Updated dependencies [3d64c6b]
- Updated dependencies [e24dd78]
- Updated dependencies [fb5c039]
  - @seamless-auth/core@0.13.0

## 0.3.1

### Patch Changes

- 62da4c2: Normalize a cookie lifetime arriving from upstream, so the two adapters cannot disagree about it.

  Registration failed on Fastify with `TypeError: option maxAge is invalid: 300`. The auth API returns
  `ttl` as the string `"300"` on its registration response. Handler results declare `ttl` as a number
  but fill it from a parsed JSON body, so nothing caught the mismatch.

  From there the adapters diverged. Express multiplies the value into milliseconds, which coerces the
  string to a number and hides the problem, so it has always worked. Fastify passes the value through
  to `cookie`, whose `Number.isInteger` check rejects a string and throws, failing the request.

  `applyCookies` now parses the lifetime once, before it reaches an adapter, and uses the parsed value
  for the `Max-Age`, the `Expires`, and the signed cookie's own expiry. Anything that is not a positive
  whole number of seconds throws with the offending value, rather than issuing a session cookie with a
  lifetime nobody can vouch for.

  The parity suite hand-wrote `ttl` as a number in every scenario, so it agreed on input the real
  upstream does not send. It now covers a string `ttl` through the registration route.

- Updated dependencies [62da4c2]
  - @seamless-auth/core@0.12.1

## 0.3.0

### Minor Changes

- 56438fc: Proxy the public system configuration at `GET /system-config/public`.

  Both adapters serve routes from an explicit list, so a new upstream route is not reachable until it
  is added here. This one returns the configured `loginMethods` to a signed-out caller, which is what
  lets the bundled sign-in screens offer the methods an instance actually has enabled instead of a
  hardcoded guess, and lets them tell whether declining a passkey during registration would leave a
  user with no way back in.

  `getPublicSystemConfigHandler` forwards no identity: no authorization header and no service token,
  matching how the upstream route is served and how `GET /oauth/providers` already behaves here. A
  signed-out browser is the expected caller, so attaching a session would only put a stale cookie in
  the path of the one call that client has to make.

  Requires the `GET /system-config/public` route on the auth API.

### Patch Changes

- Updated dependencies [56438fc]
  - @seamless-auth/core@0.12.0

## 0.2.0

### Minor Changes

- 39d71a2: Serve the Seamless admin console from a Fastify API, matching the Express adapter's `createSeamlessConsoleProxy`.

  `seamlessConsoleProxy` is a plugin you register under a prefix, the same shape as `seamlessAuth`, so the mount path comes from Fastify rather than from the options. The Express adapter mounts a router and takes its upstream subtree from `basePath`; here `basePath` only says what to request upstream, and it still defaults to `/console`.

  It proxies `GET` and `HEAD` with `fetch`, forwards nothing from the incoming request but the method and the path, and copies back `content-type`, `cache-control`, `etag`, and `last-modified`. Unknown paths under the prefix go upstream too, which is how deep links into the dashboard get the SPA shell. A path that resolves outside the console subtree, or that carries an encoded path separator, is refused with a 400 and never reaches the upstream.

  The two adapters resolve the upstream URL from the raw request path for the same reason but by different routes: Express normalizes dot-segments before routing, and Fastify percent-decodes wildcard params, so this reads `request.url` instead of `request.params` to keep the traversal check looking at what the client actually sent.

  The parity suite now runs the console proxy through both adapters and asserts the status, body, caching headers, and upstream URL match.

  New exports: `seamlessConsoleProxy`, `SeamlessConsoleProxyOptions`.

## 0.1.0

### Minor Changes

- f032a64: Add `@seamless-auth/fastify`, a Fastify adapter serving the same routes as the Express adapter.

  Register it under a prefix and it serves the auth flows, the passthrough proxy routes, and the admin, session, metrics, and system-config routes, managing the session cookies they depend on. `requireAuth` and `requireRole` are exported as `preHandler` hooks for an adopter's own routes, alongside `getSeamlessUser`.

  Both adapters emit identical responses. A parity suite runs the same requests through each against the same mocked auth API and asserts the status, body, and every `Set-Cookie` header match, so the two cannot drift.

  `createSeamlessConsoleProxy` has no Fastify equivalent yet. It proxies the admin console's static assets and is separate from the auth routes.

### Patch Changes

- Updated dependencies [f032a64]
- Updated dependencies [c52b5d1]
- Updated dependencies [519a1b0]
- Updated dependencies [3c5c1c5]
- Updated dependencies [d17896b]
- Updated dependencies [9735f83]
- Updated dependencies [9e04625]
- Updated dependencies [82fc15a]
- Updated dependencies [d7d408d]
- Updated dependencies [744418b]
- Updated dependencies [17c5487]
- Updated dependencies [583271a]
- Updated dependencies [a5e3070]
- Updated dependencies [8e03099]
  - @seamless-auth/core@0.11.0
