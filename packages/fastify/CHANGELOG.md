# @seamless-auth/fastify

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
