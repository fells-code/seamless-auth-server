# @seamless-auth/express

## 0.11.0

### Minor Changes

- 8e03099: Split the handler result `error` field into `errorCode` and `errorBody`.

  BREAKING for direct consumers of the handler result types. Released as a minor because these packages are pre-1.0, where a minor is the breaking bump. The details are below.

  `error` meant two different things depending on which handler produced it. On 12 sites it held the auth API's whole failure body, forwarded to the caller unchanged. On 8 sites it held a short code that the adapter wrapped as `{ error }`. The declared types could not describe either honestly, and `FinishLoginResult` declared `error?: string` while assigning the whole body. Nothing in the type told an adapter which rendering applied, which is the first thing a second adapter has to get right.

  Failures are now reported through `ResultFailure`, exported from `@seamless-auth/core`:

  - `errorCode?: string` is a code this package chose. Adapters render it as `{ error, details }`.
  - `errorBody?: unknown` is the auth API's own failure body. Adapters forward it unchanged.

  BREAKING for code that reads `result.error` off a handler imported from `@seamless-auth/core/handlers/*`. Read `errorBody` for the auth-flow handlers (login, finishLogin, register, finishRegister, requestOtp, verifyLoginOtp, requestMagicLink, pollMagicLinkConfirmation, verifyMagicLink, switchOrganization, and the OAuth handlers) and `errorCode` for the rest (me, ensureCookies, admin, sessions, internalMetrics, systemConfig). The OAuth handlers return a union, so `"error" in result` becomes `"errorBody" in result`.

  The HTTP responses are unchanged, so no adopter application, SDK, or dashboard needs to change. This was verified rather than assumed: the adapter's failure responses were captured on both revisions across 6 upstream body shapes and 3 route kinds and compared, and all 18 are byte-identical. They were also run through `extractMessage` and `getOAuthErrorCode` from `seamless-auth-react`, with identical results, including the OAuth `code` that has to stay at the top level of the body.

  A new `failureWireFormat` test in `@seamless-auth/express` locks these shapes so later refactors cannot move them silently.

### Patch Changes

- f032a64: Move the remaining guard decisions into core, and fully specify a cookie's lifetime in the response contract.

  `checkOrigin`, `authenticateCookie`, and `authorizeRoles` join `checkProxyIdentity`: each takes the request facts a guard needs and returns a `GuardRejection` or nothing, so an adapter reads headers and cookies and writes a response but decides nothing. The Express origin guard, `requireAuth`, and `requireRole` now call them, which is a straight substitution with no behavior change.

  `SeamlessAuthUser` comes from `@seamless-auth/types`, which already defines it, rather than being declared again here. It is re-exported from `@seamless-auth/core` and `@seamless-auth/express` under the same name, so nothing changes for adopters. The re-export is type-only, so it is erased at compile time and neither `zod` nor the schema barrel enters the runtime module graph.

  `SetCookieCommand` and `ClearCookieCommand` now carry an `expires` alongside `maxAgeSeconds`. Previously the command specified only a max age, and two adapters could satisfy it while emitting different headers: Express sent both `Expires` and `Max-Age`, and a second adapter sent only `Max-Age`, which older clients treat as a session cookie. Specifying both means every adapter emits the same header for the same instruction. Clearing carries the epoch for the same reason.

  No change to what `@seamless-auth/express` sends. The `expires` it now receives explicitly is the value it was already deriving.

- 519a1b0: Give the auth API's contract values one home in `@seamless-auth/core`.

  The external-delivery header and the service-token identity were written out at each call site: the `x-seamless-auth-delivery-mode: "external"` header in three core handlers, the fixed issuer and audience in three places across the adapter, and the `dev-main` key id fallback in three more. Each is defined by `seamless-auth-api`, so changing one is coordinated cross-repo work, and finding every copy was part of the job.

  New exports: `AUTH_DELIVERY_MODE_HEADER`, `EXTERNAL_DELIVERY_MODE`, `EXTERNAL_DELIVERY_HEADERS`, `SERVICE_TOKEN_ISSUER`, `SERVICE_TOKEN_AUDIENCE`, `DEV_JWKS_KID`, `EXTERNAL_DELIVERY_TOKEN_SUBJECT`, and `buildExternalDeliveryAuthorization`, which mints the `Authorization` value for an external-delivery request.

  No behavior change. The minted tokens carry the same header and claims as before, confirmed by decoding them. A new test asserts each contract value literally, so a change to one breaks a named test rather than surfacing as an upstream rejection at runtime.

  The service-token issuer and audience are fixed by the API and are not the adopter's configured audience, which applies to user tokens. That is now stated where the constants are defined rather than in a comment at one of the call sites.

  Part of #72.

- 3c5c1c5: Move the response contract into `@seamless-auth/core`.

  Turning a handler result into an HTTP response was adapter knowledge: sign each session cookie, mirror the set attributes when clearing, clear before setting, write cookies before the body, send an upstream failure body untouched but wrap a code as `{ error, details }`. The Express adapter carried it, copied across nine handlers plus the cookie middleware, and every new adapter would have had to reproduce all of it correctly.

  Core now owns it. New exports:

  - `applyResult(result, adapter, opts)` applies a result to a response.
  - `applyCookies(result, adapter, opts)` applies only the cookie instructions, for middleware that continues the request instead of answering it.
  - `ResponseAdapter`, the three things an adapter must provide: `setCookie`, `clearCookie`, and `send`.
  - `signSessionCookie`, `resolveCookieSameSite`, and the `CookieSameSite`, `CookieSecurityOptions`, `SetCookieCommand`, `ClearCookieCommand`, `SessionCookie`, and `AppliableResult` types.

  Cookie signing moves to core with them, because the cookie format is core's: an adapter that signed differently would mint sessions this package cannot read back.

  The Express adapter drops 291 lines of source and 5.5KB of bundle, and `@seamless-auth/express` no longer carries its own cookie module. Nothing is removed from its public surface. `CookieSameSite` is now re-exported from core rather than declared locally, so `SeamlessAuthServerOptions` is unchanged for adopters.

  Responses are unchanged with one exception, noted below. Status, body, and every `Set-Cookie` header were captured on both revisions across eleven scenarios covering session set and clear, secure and insecure policy, a custom cookie domain, coded and passthrough failures, an empty failure body, and success bodies. All are byte-identical, including `HttpOnly`, `Secure`, `SameSite`, `Domain`, `Path`, and `Max-Age`.

  Empty responses are now consistent about their content type. A route whose upstream returned success with no body previously sent `Content-Type: application/json` with a zero-length body, because the handler called the framework's JSON method with `undefined`. It now sends no content type, matching the routes that already ended the response instead. `Content-Length: 0` is unchanged either way, and a client reading the body sees nothing in both cases, since parsing an empty body fails regardless of the content type. Anything asserting on the content type of an empty response needs updating.

  Part of #72.

- d17896b: Move the passthrough proxy into `@seamless-auth/core`, and fix repeated query parameters being joined.

  The 33 organizations, step-up, TOTP, users, and admin passthrough routes existed only inside the Express adapter, with no core equivalent, so a new adapter would have had to rebuild both the upstream call and the session gate that guards it. New exports:

  - `proxyRequest({ authServerUrl, path, method, authorization, serviceAuthorization, forwardedClientIp, query, body })` forwards a request and returns the upstream status and body unchanged.
  - `checkProxyIdentity({ subject, cookies, identity, ...cookieNames })` is the pure session gate, returning the rejection to send or `undefined` to proceed.
  - `buildQueryString` and `buildUpstreamUrl` replace three separate querystring builders that had drifted apart.

  **Fix:** a repeated query parameter reached the auth API joined into a single comma-separated value on the admin and internal-metrics routes. `GET /admin/auth-events?type=login&type=logout` was forwarded as `type=login,logout`, and the API's `AuthEventQuerySchema` accepts `type` as an array, so the joined value matched no event type and the filter silently returned the wrong set. Array parameters are now forwarded as repeated parameters on every route. Nested objects are dropped rather than stringified, so a query like `?filter[from]=x` can no longer reach the API as `filter=[object Object]`.

  The Express adapter drops 38 lines, `createServer.ts` drops from 705 to 667 lines, and the proxy handler is now a gate check, a call, and a response.

- 0b384e2: Take the messaging types from `@seamless-auth/core` instead of redeclaring them.

  `packages/express/src/messaging.ts` was byte-identical to `packages/core/src/authMessaging.ts`, so every messaging type was declared twice and the two copies could drift without anything failing. The express copy is deleted and the re-exports now point at core, matching the pattern already used for `SeamlessUser`, `hasScopedRole`, and `roleGrantsAccess`.

  No public surface change. `@seamless-auth/express` exports the same type names from its package root, and the deleted module was never reachable on its own because the package declares only a root export. The types the adapter and the core now share are one declaration rather than two structurally identical ones.

- 1d0c45c: Encode the provider id on the OAuth provider admin routes before forwarding it upstream.

  `PATCH` and `DELETE /system-config/oauth-providers/:id` interpolated `req.params.id` straight into the upstream URL. Every other proxied route param goes through `encodeURIComponent`, and these two were missed when that pass landed. A param carrying `?`, `#`, or an encoded `/` was decoded into the URL raw, so it could append or override upstream query parameters or reshape the upstream path.

  An id of `abc?admin=1` was forwarded as `/system-config/oauth-providers/abc?admin=1`, turning attacker-controlled input into an upstream query parameter. It is now forwarded as a single encoded path segment, which upstream rejects as an unknown id.

  The routes require an authenticated access session, so this is not reachable anonymously.

- 17c5487: Move auth message delivery into `@seamless-auth/core`.

  `deliverAuthMessage`, `applyExternalDelivery`, and `stripDelivery` lived in the Express adapter but had no framework coupling: their only imports were the messaging types, which already came from core. Every future adapter would have had to reimplement or copy them. They now sit beside the messaging contract in core and are exported from the package root, and the adapter imports them.

  `applyExternalDelivery`, `deliverAuthMessage`, and `stripDelivery` are new named exports of `@seamless-auth/core`. Nothing is removed from `@seamless-auth/express`: the three helpers were internal to it and were never exported.

  The warning logged when external delivery is requested but the auth API returns no delivery payload is now prefixed `[SeamlessAuth]` rather than `[SEAMLESS-AUTH-EXPRESS]`, matching the rest of core. The text is unchanged. Anything matching on that prefix in log processing needs updating.

  Part of #72.

- 583271a: Preserve the upstream error detail on the admin, session, internal-metrics, and system-config proxy routes.

  These handlers read the failure code out of the upstream body's `error` key and fell back to a constant (`admin_request_failed`, `session_request_failed`, `internal_request_failed`, `failed_to_fetch_roles`, `failed_to_fetch_config`, `failed_to_update_config`) whenever that key was missing. The auth API answers a validation failure with a Zod body shaped `{ name, message }` and no `error` key, so every validation failure collapsed to the constant. A `PATCH /admin/users/:id` rejected for its `phone` field came back as `{"error":"admin_request_failed"}`, with nothing naming the field, and the detail was not recoverable from the API's request logs either.

  The handler results and the Express responses now carry the upstream detail. `error` is the upstream `error` string when present, otherwise the upstream `message` string, and only then the constant fallback for an empty or non-JSON-object body. A new optional `details` field carries the parsed upstream body whenever it holds more than the derived `error` string, so a Zod body reaches the caller intact.

  This is additive: a response that already carried an upstream `error` code is unchanged and gains no `details` key. Callers that switch on the constant fallback for validation failures should read `details` (or the now-descriptive `error`) instead.

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

## 0.10.0

### Minor Changes

- fa1c736: Remove the admin bootstrap invite flow from the adapter.

  The Seamless Auth API dropped the flow, so `POST /internal/bootstrap/admin-invite` no longer exists upstream and the API never emits a `bootstrap_invite_email` delivery. Everything the adapter carried for it was unreachable: the proxy route returned whatever the upstream 404 produced, and the delivery branch could not be selected. The first admin is now granted through the API's `OWNER_EMAIL` instead.

  BREAKING: `bootstrapAdminInviteHandler` (`@seamless-auth/core/handlers/bootstrapAdminInvite`) and the `SendBootstrapInviteEmailInput` type are gone, `AuthMessagingHandlers.sendBootstrapInviteEmail` and `AuthMessageOverrides.bootstrapInviteEmail` are removed, and `bootstrap_invite_email` is no longer a member of `AuthDeliveryInstruction`. Adopters passing a `sendBootstrapInviteEmail` handler or a `bootstrapInviteEmail` override should drop it; `handlers` is a `Partial`, so nothing else needs to change. Callers of the `/internal/bootstrap/admin-invite` route get a 404 from the adapter now rather than from the upstream API.

  The `bootstrapToken` entries in the core redaction patterns stay. They are a log-scrubbing denylist, and keeping a stale term only makes scrubbing more conservative.

### Patch Changes

- Updated dependencies [fa1c736]
  - @seamless-auth/core@0.10.0

## 0.9.0

### Minor Changes

- de96f29: Breaking: remove the duplicate `sub` field from `SeamlessAuthUser`.

  `requireAuth` populated both `id` and `sub` on `req.user` from the same access token `sub` claim.
  Only `id` remains, which is also the identifier exposed by `getSeamlessUser`, so both user sources
  now agree on one field name.

  Adopters must replace `req.user.sub` with `req.user.id`. Any defensive `user.sub ?? user.id`
  coalescing can be reduced to `user.id`. The `sub` claim inside JWT payloads is unchanged.

  `getSeamlessUser` also gains a real return type. It previously returned `any` by default, which is
  what made that coalescing look necessary. It now returns the exported `SeamlessUser` interface
  (`id`, `email`, `phone`, `roles`, plus optional `lastLogin` and `activeOrganizationId`), matching
  the auth API's `GET /users/me` response. The generic parameter is unchanged for callers that pass
  their own type.

- 9bc928d: Fix two security issues in the Express adapter.

  Cookie clearing now mirrors the cookie set path. `clearSessionCookie` and
  `clearAllCookies` previously emitted a clearing header with no `Secure` or
  `SameSite`, which browsers reject in a cross-site response. In the default
  cross-site deployment that meant logout returned 204 and revoked the session
  upstream while the signed cookie survived in the browser and stayed valid for
  every route guarded by `requireAuth` until its own TTL expired.

  BREAKING: `GET /auth/logout` and `GET /auth/magic-link` are removed. Both were
  state-changing routes reachable as simple cross-site requests, so an `<img src>`
  on any page could revoke all of a user's sessions or trigger magic-link emails.
  Use `DELETE /auth/logout/all` in place of `GET /auth/logout`, and the new
  `POST /auth/magic-link` in place of `GET /auth/magic-link`.

- 9d25cca: Add a router-level CSRF guard that rejects cross-site state-changing requests when the adapter issues `SameSite=None` cookies.

  The guard enforces `Sec-Fetch-Site` by default with no configuration: a non-safe request (anything other than GET, HEAD, or OPTIONS) is rejected with 403 when `Sec-Fetch-Site` is `cross-site`. Page JavaScript cannot forge that header and same-origin SPA calls send `same-origin` or `same-site`, so legitimate traffic passes untouched. When `Sec-Fetch-Site` is absent (older browsers), the request `Origin` is matched against the new opt-in `allowedOrigins` option; if `allowedOrigins` is unset the request passes, so nobody regresses. Server-to-server callers that send neither header pass, and a literal `null` origin is treated as cross-site. The guard only activates when the effective `sameSite` is `none`.

- 827b4ed: Serve the OTP generate routes over POST instead of GET.

  `GET /auth/otp/generate-phone-otp`, `-email-otp`, and their `-login-` variants were state-changing routes (each sends an SMS or email) reachable as a simple cross-site request, so an `<img src>` on any page could trigger unbounded OTP messages to a signed-in user. This is the same vector already closed for `/auth/magic-link`.

  BREAKING: the four `GET /auth/otp/generate-*` routes are removed and replaced with POST. Pair this with `@seamless-auth/react` 0.5.0 or later, which requests them over POST. An older SDK that still issues GET will get a 404.

- d3e9274: Post-release follow-up cleanups from the pre-release audit.

  - Bound the refresh-result cache in core. Entries were keyed by the rotating refresh cookie and never revisited, so the map grew without limit and retained tokens for the process lifetime. It now sweeps expired entries (throttled) and caps total size.
  - Memoize the JWKS key set per auth-server URL in `verifySignedAuthResponse`. It was rebuilt on every call, so jose's key cache and refetch cooldown never engaged and every verification made an extra request to `/.well-known/jwks.json`.
  - `SeamlessAuthUser.email` is now optional and `phone` is `string | null`, matching the cookie payload and the upstream `/users/me` shape. This is a type-level change: consumers that treated `phone` as a non-null `string` will need to handle `null`.
  - Export `redactSensitiveText` from core and use it to mask tokens and secrets before the Express router logs an unhandled error.
  - Reorder the `/magic-link/check` cookie requirement so it is no longer shadowed by `/magic-link`, throw a clear error when a route parameter is missing instead of forwarding the literal string `"undefined"`, correct the `Missing cookieSecret` message that named a removed environment variable, and drop a redundant terminal `.end()` after `res.json(...)`.

- 072d65a: **Breaking:** remove the `issuer` option from `SeamlessAuthServerOptions`. Delete the `issuer` line from your `createSeamlessAuthServer(...)` call; no other change is needed.

  The option was required but write-only. Since the silent-refresh path moved to the fixed M2M contract constants (`iss: seamless-portal-api`, `aud: seamless-auth`), the adopter-supplied value reached nothing, so removing it changes no runtime behavior. `audience` is unaffected and stays required: it is enforced when verifying signed auth-server responses.

  The adapter README also documents a deployment constraint that produced an opaque failure: `authServerUrl` must exactly match the auth server's `ISSUER` environment variable, because signed responses are verified with `iss === authServerUrl`. Pointing the adapter at an internal address while the auth server issues its public URL fails every login with only a generic verification error.

- d1bbc6d: Require Express 5.

  BREAKING: the `express` and `@types/express` peer ranges are now `>=5.0.0`, up from `>=4.18.0` and `>=4.17.0`. Adopters still on Express 4 need to upgrade their application before taking this release.

  Under Express 4 a rejected handler promise was never routed anywhere, so an upstream failure (a network error reaching the auth server, for example) left the request hanging until the client timed out. Express 5 forwards rejected handler promises to error middleware, which makes those failures terminate properly.

  The router now also registers its own error middleware. The Express built-in handler answers with an HTML stack trace, including absolute server paths, whenever `NODE_ENV` is not `production`. Route errors now return `500` with a JSON `{ "error": "internal_error" }` body and are logged server side instead.

- 2627da4: Send a genuine machine-to-machine service token on proxied routes, and derive the forwarded client IP from a trusted hop.

  `authFetch` no longer falls back to `authorization` when no `serviceAuthorization` is given, so the browser user's access token is never placed in the `x-seamless-service-token` header. The user's identity now travels in `Authorization` only. `serviceAuthorization` is accepted by every core handler that already accepted `forwardedClientIp`.

  The Express adapter mints a real HS256 service token for proxied routes, signed with the configured `serviceSecret` and carrying the fixed `iss`/`aud` the auth server requires. The auth server only honors `x-seamless-client-ip` when a valid service token accompanies it, so client IP forwarding previously no-opped: IP-keyed rate limiters and audit records attributed proxied requests to the adapter's egress IP instead of the end user's. Tokens are reused for 45 seconds rather than signed per request.

  The forwarded client IP is now validated as a real IP address, and is dropped when Express `trust proxy` is set to blanket `true`, since `req.ip` is then taken from a client-supplied `X-Forwarded-For`. Set `trust proxy` to an explicit hop count or subnet. A new `resolveClientIp` option lets adopters derive the address themselves when their topology needs it.

### Patch Changes

- 3342a66: Correct the adapter usage docs. The README Quick Start now passes every required option (`authServerUrl`, `cookieSecret`, `serviceSecret`, `audience`) and calls `requireAuth({ cookieSecret })`, so the copy-paste example runs. The Environment Variables table, which listed variables the adapter never reads (including unrelated database settings), is replaced with a configuration section stating that all settings are passed as options. The `requireAuth` JSDoc no longer claims the guard performs token refresh or documents a positional signature it does not accept, and its duplicated options interface is removed.
- 9bae2bf: Register `/users/update`, `/users/credentials`, `/sessions`, and `/admin/credential-count` in the core cookie requirements table. Without these entries the ensureCookies middleware never populated `req.cookiePayload`, so `/users/update` and `/users/credentials` returned 401 and `/sessions` and `/admin/credential-count` failed to forward the access token upstream.
- 9f12585: Drive cookie `Secure` and `SameSite` from explicit adapter options instead of ambient `NODE_ENV`.

  Session cookies previously only got `Secure` and `SameSite=None` when `process.env.NODE_ENV === "production"`, so a production deploy that forgot to set `NODE_ENV` shipped session cookies over plaintext HTTP with a weaker CSRF posture.

  `createSeamlessAuthServer` and `createEnsureCookiesMiddleware` now accept:

  - `cookieSecure?: boolean`, defaulting to `true`
  - `cookieSameSite?: "lax" | "none" | "strict"`, defaulting to `none` when secure and `lax` otherwise

  Cookies are now secure by default in every environment. Set `cookieSecure: false` for local HTTP development. If you relied on the old behavior to develop over plain HTTP without setting `NODE_ENV=production`, add `cookieSecure: false` to your local configuration.

- 0672bd8: Move secret strength validation into the core and apply it to every entry point that accepts a secret.

  The 32 character minimum on `cookieSecret` and `serviceSecret` previously only guarded
  `createSeamlessAuthServer` and `createEnsureCookiesMiddleware` in the Express adapter, so an adopter
  calling a core function or `requireAuth` directly got no protection.

  `@seamless-auth/core` now owns the check and exports `MIN_SECRET_LENGTH`, `assertSecretStrength`,
  and `assertSecrets`. It runs in `ensureCookies`, `refreshAccessToken`, `getSeamlessUser`, and
  `createServiceToken`. The Express adapter re-uses the core implementation and adds it to
  `requireAuth`, which previously only checked that `cookieSecret` was present.

  `verifyCookieJwt` and `verifyRefreshCookie` are deliberately unchanged. They are low-level
  primitives with a documented "return `null` on failure" contract, and every code path in these
  packages that reaches them validates the secret first.

  Adopters passing a secret shorter than 32 characters to any of these functions will now get a thrown
  error naming the option. Generate replacements with a CSPRNG, for example `openssl rand -base64 48`.

- cb84eb4: Encode user-derived path segments before interpolating them into upstream auth server URLs.

  Admin handlers, session handlers, and the Express `/magic-link/verify/:token` route interpolated route params directly into the upstream URL. A param carrying an encoded `?`, `#`, `;`, or `%2F` was decoded into the URL raw, so it could append or override upstream query params or reshape the upstream path.

  Every user-derived segment now goes through `encodeURIComponent`, matching the organization and OAuth routes. A param that previously reshaped the upstream request is now confined to a single path segment, which upstream rejects as an unknown id.

- 656288a: Stop rewriting client errors to 500 in the router error middleware. `express.json()` is mounted on the same router, so body-parser failures land in the catch-all. Those errors carry their own status (400 for `entity.parse.failed`, 413 for `entity.too.large`), and the middleware discarded it: a malformed JSON body answered `500 {"error":"internal_error"}` instead of 400. The middleware now honors a 4xx status from `status` or `statusCode` and answers with a generic body (`bad_request`, or `payload_too_large` for 413). Genuine 5xx failures are unchanged and still answer `500 {"error":"internal_error"}`.

  Client errors are also no longer written to `console.error`. Every malformed request produced an error-level log line, so an unauthenticated caller could generate unbounded error log volume. Only 5xx failures log now.

  The error object is still never serialized to the client. That matters here because `entity.parse.failed` errors carry a `body` property holding the raw payload, so echoing the parser error would reflect request content back.

- 69ad64a: Fix `DELETE /users/credentials` proxying to the auth API as a `POST`. The adapter now forwards the request as a `DELETE`, matching the API's `deleteCredential` contract (the previous default hit `updateCredential` instead).
- 4748a6b: Forward the service token from `getSeamlessUser`, so the client IP it sends is honored again.

  `GetSeamlessUserOptions` did not declare `serviceAuthorization` and the core `authFetch` call never passed it. The Express adapter still computed the service token and passed it, but an `as GetSeamlessUserOptions` cast on the option literal discarded it without a type error. Every `getSeamlessUser` call therefore sent `x-seamless-client-ip` with no accompanying service token, and the auth server ignores the forwarded IP unless a valid service token rides with it. Rate limiting, lockout, and anomaly detection attributed those requests to the adapter's egress IP instead of the end user's. This restores the behavior added in 0.7.0.

  `GetSeamlessUserOptions.authorization` is now optional, which matches what the adapter already passed: it resolves the user's access token from `req.cookiePayload` or `req.user`, both of which are unset when `getSeamlessUser` is called outside the auth router or the `requireAuth` guard. The required type was only satisfied by the same cast that hid the dropped service token.

- e9bd7a1: Fix assorted correctness bugs:

  - Magic link polling no longer returns a body with its 204 response. Express strips bodies on 204, so the message was never delivered. The 204 status is unchanged.
  - `getSeamlessUser` no longer throws when the auth server returns a 200 with an empty body. It resolves to null instead.
  - `/internal/auth-events/grouped` now forwards query params to the auth server, matching the summary and timeseries routes. Grouping and filter params were previously ignored.
  - The bootstrap admin invite handler now surfaces string-shaped upstream errors instead of falling back to `bootstrap_failed`, and no longer throws when the request has no parsed body.

- 6ea09c9: Export `createSeamlessAuthServer` by name. The symbol was imported into the package entry point and used only for the default export, so `import { createSeamlessAuthServer } from "@seamless-auth/express"` resolved to `undefined` and threw `TypeError: createSeamlessAuthServer is not a function`. That is the form used by the README Quick Start, every other README example, and the Express template scaffold, so the documented setup path did not run. The default export is unchanged and still works.

  The adapter README also documented a `getSeamlessUser` signature that no longer exists. It showed `getSeamlessUser(req, authServerUrl, cookieName?)`, while the real signature takes the same options object as `createSeamlessAuthServer`. Following the documented call reached the core secret check and threw on a missing `cookieSecret`.

  Both packages now carry a smoke test that imports every documented symbol by name from the built `dist`, so a named export that goes missing fails the suite instead of shipping.

- 3296263: Proxy the new OAuth provider admin routes to the auth API: `GET`/`POST /system-config/oauth-providers` and `PATCH`/`DELETE /system-config/oauth-providers/:id`, all gated on the access identity. Register `/system-config/oauth-providers` in the core cookie requirements table so the ensureCookies middleware populates `req.cookiePayload` for both the collection and the id-scoped routes; without it the proxy never attaches the access token and the routes fail closed.
- c53ab04: Correct published package metadata. Both packages now declare `engines.node` matching the Node 24 repo baseline, point `repository.url` at the repo root with a `directory` field, and declare a `bugs` URL. The express package gains the `homepage` field the core package already had.
- 44f98d0: Close two path-encoding containment gaps.

  The Express console proxy relied on `new URL` normalizing `..` segments to keep requests inside the mounted subtree, but WHATWG `URL` does not decode `%2f` or `%5c`, so `/console/..%2fadmin/users` passed the prefix check and was forwarded upstream verbatim where a decoding upstream could escape the console subtree. The proxy now rejects any subpath containing an encoded path separator with a 400.

  The core `verifyMagicLinkHandler` interpolated its token into the upstream path without `encodeURIComponent`, unlike every sibling handler. A caller wiring it to a route param could send a traversal- or query-shaped token that reshaped the upstream request while carrying the caller's service authorization. The token is now encoded to a single path segment.

- 49e31f9: Pre-release documentation and metadata corrections. The `requireRole` JSDoc example no longer calls `requireAuth()` with no arguments (which does not compile and throws), its malformed code fence is closed, and it now shares a constructed guard. The README Quick Start startup log matches its listen port, the `createSeamlessAuthServer` options block lists the `resolveClientIp` option, and the end-to-end flow references the real `webAuthn/login/finish` route. Both packages now declare `keywords` for npm discoverability.
- 7e65ca5: Fix the silent-refresh service token so it carries the M2M contract issuer and audience (`iss: seamless-portal-api`, `aud: seamless-auth`) instead of the adopter-configured issuer and the auth server URL. The auth API validates the forwarded service token with a fixed issuer and audience, so the previous values caused the token to be rejected and the real client IP to be dropped on refresh, breaking IP-based rate limiting and anomaly detection.
- 682c9f8: Remove the redundant `as any` / option-object casts across the Express adapter so the compiler checks each option literal against its handler interface. These casts were the construct that previously let a mistyped option (`serviceAuthorization`) be silently dropped. No public API change. One internal cleanup with a visible edge case: the internal metrics handlers now reduce an array-valued query parameter to its first value rather than letting it reach the upstream comma-joined, which the scalar handler contract never supported.
- 0a65ef6: Validate secret strength at startup, warn on the dev JWKS key id, and stop logging the cookie payload.

  `cookieSecret` and `serviceSecret` were only checked for presence, so a short secret could be brute
  forced offline and used to forge cookie sessions and service tokens. Both are now required to be at
  least 32 characters. `createSeamlessAuthServer` and `createEnsureCookiesMiddleware` throw with a
  clear message when a secret is missing or too short.

  This is a behavior change at startup: a deployment running with a weak secret will now fail fast
  instead of starting. Generate replacements with a CSPRNG, for example `openssl rand -base64 48`.

  `jwksKid` still defaults to `dev-main`, but the adapter now logs a warning when the default is used
  so an unconfigured key id is visible in production logs.

  `createSeamlessAuthServer` no longer passes `req.cookiePayload` to `console.warn` when a request is
  missing its session subject. The payload could contain `token`, `sub`, and `roles`.

- c7f6a98: Bind the configured `audience` when verifying signed auth responses. `verifySignedAuthResponse` now enforces the `aud` claim in `jwtVerify`, and the login, finishLogin, finishRegister, OAuth, OTP, magic-link, and switch-organization handlers thread `SeamlessAuthServerOptions.audience` through to it. Previously only the issuer was checked, so on a multi-relying-party auth server a token minted by the same issuer for a different application would pass verification and be accepted as this app's session.
- 2b71440: Warn when external delivery is requested but the auth server returns no delivery payload. The four auth-message routes (OTP email, OTP SMS, magic-link email, bootstrap invite email) previously fell through to a plain success response in that case, so a `serviceSecret` that does not match the auth server's `API_SERVICE_TOKEN` produced a successful-looking response with no message sent and nothing logged. The delivery branch shared by those routes is now a single `applyExternalDelivery` helper that logs a warning on a missing payload. Response bodies and status codes are unchanged. The messaging section of the README now documents `serviceSecret` as a prerequisite for auth-message delivery.
- Updated dependencies [de96f29]
- Updated dependencies [9bae2bf]
- Updated dependencies [0672bd8]
- Updated dependencies [cb84eb4]
- Updated dependencies [4748a6b]
- Updated dependencies [c2746aa]
- Updated dependencies [e9bd7a1]
- Updated dependencies [3296263]
- Updated dependencies [c53ab04]
- Updated dependencies [44f98d0]
- Updated dependencies [d3e9274]
- Updated dependencies [49e31f9]
- Updated dependencies [2627da4]
- Updated dependencies [c7f6a98]
  - @seamless-auth/core@0.9.0

## 0.8.0

### Minor Changes

- d769c0d: Add `createSeamlessConsoleProxy` to serve the Seamless admin dashboard SPA at `/console` on the same origin as the adapter's `/auth/*` endpoints. The companion Router reverse-proxies `GET`/`HEAD` requests to the auth API's `/console`, forwards the upstream status and cache headers, guards against path traversal outside the console subtree, and never forwards the incoming session cookie or Authorization header upstream.

## 0.7.1

### Patch Changes

- ce6a577: Fix requireAuth dropping the access token from req.user. The middleware now
  attaches the inner access token as req.user.token, so getSeamlessUser and
  buildServiceAuthorization can forward it as the bearer credential when calling
  the auth server. Previously trusted server adapters received a "Missing bearer"
  error and every authenticated route returned 401.

## 0.7.0

### Minor Changes

- 2b1a07a: Expose TOTP routes through the adapter. `@seamless-auth/express` now mounts
  `GET /auth/totp/status`, `POST /auth/totp/enroll/start`,
  `POST /auth/totp/enroll/verify`, `POST /auth/totp/disable`, and
  `POST /auth/totp/verify-mfa`, proxying the caller's access session upstream like
  the step-up routes. This lets frontends drive TOTP enrollment, management, and
  TOTP-based step-up verification, which previously had no adapter surface.

  `@seamless-auth/core` adds the matching access-cookie requirements for those
  paths and now matches cookie requirements case-insensitively. Express route
  matching is case-insensitive by default, so a client path whose casing differed
  from the mounted route (for example `/webauthn/...` vs `/webAuthn/...`)
  previously failed the case-sensitive requirement lookup, silently skipped cookie
  loading, and broke the request downstream. The lookup is now normalized.

  TOTP as a login second factor is intentionally not included: the auth API does
  not currently gate login on TOTP, so `/totp/verify-login` has no trigger yet.

### Patch Changes

- ab85a16: Don't crash on non-JSON upstream responses. `authFetch` now parses response bodies
  defensively, so a plain-text error (e.g. a rate-limited `429 Too many requests`) or an
  empty body (`204`) no longer throws in handlers that read the body before checking the
  status — which previously surfaced as an unhandled rejection that took down the adapter
  process. Non-JSON bodies are returned as `{ message: <text> }`; empty bodies as
  `undefined`. Fixes #41.
- 07c9837: Issue a session on OTP-based registration. Registration now starts with just an
  email, and verifying the registration email OTP completes sign-up and returns a
  session. The adapter previously proxied `/otp/verify-email-otp` and
  `/otp/verify-phone-otp` without setting cookies, so browser users finished
  registration unauthenticated. A new `verifyRegistrationOtpHandler` (core) plus a
  `verifyRegistrationOtp` express handler now set the session cookies on these
  routes (tolerating a phone-first step that returns no session yet), mirroring the
  login OTP verify handlers.
- 26ba2e3: fix: updates core implementation to supply the authorization value during polling for magic links
- 70cf1c2: Fixes for deleting users as an admin, and internal auth events summary route token handling
- Updated dependencies [ab85a16]
- Updated dependencies [07c9837]
- Updated dependencies [26ba2e3]
- Updated dependencies [2b1a07a]
- Updated dependencies [70cf1c2]
  - @seamless-auth/core@0.7.0

## 0.6.0

### Patch Changes

- e52ff77: Don't crash on non-JSON upstream responses. `authFetch` now parses response bodies
  defensively, so a plain-text error (e.g. a rate-limited `429 Too many requests`) or an
  empty body (`204`) no longer throws in handlers that read the body before checking the
  status — which previously surfaced as an unhandled rejection that took down the adapter
  process. Non-JSON bodies are returned as `{ message: <text> }`; empty bodies as
  `undefined`. Fixes #41.
- 3cf132e: Issue a session on OTP-based registration. Registration now starts with just an
  email, and verifying the registration email OTP completes sign-up and returns a
  session. The adapter previously proxied `/otp/verify-email-otp` and
  `/otp/verify-phone-otp` without setting cookies, so browser users finished
  registration unauthenticated. A new `verifyRegistrationOtpHandler` (core) plus a
  `verifyRegistrationOtp` express handler now set the session cookies on these
  routes (tolerating a phone-first step that returns no session yet), mirroring the
  login OTP verify handlers.
- 39f7aad: fix: updates core implementation to supply the authorization value during polling for magic links
- 46f4f02: Fixes for deleting users as an admin, and internal auth events summary route token handling
- Updated dependencies [e52ff77]
- Updated dependencies [3cf132e]
- Updated dependencies [39f7aad]
- Updated dependencies [46f4f02]
  - @seamless-auth/core@0.6.0

## 0.5.4

### Patch Changes

- b4a1491: fix: updates core implementation to supply the authorization value during polling for magic links
- f3206ea: Fixes for deleting users as an admin, and internal auth events summary route token handling
- Updated dependencies [b4a1491]
- Updated dependencies [f3206ea]
  - @seamless-auth/core@0.5.4

## 0.5.3

### Patch Changes

- 3d979b1: Fixes for deleting users as an admin, and internal auth events summary route token handling
- Updated dependencies [3d979b1]
  - @seamless-auth/core@0.5.3

## 0.5.2

### Patch Changes

- ac96299: Operational tidy work and extension of the logout functions for future use
- Updated dependencies [ac96299]
  - @seamless-auth/core@0.5.2

## 0.5.1

### Patch Changes

- e39adc8: Move package development and release management to a pnpm workspace backed by
  Changesets. The Express adapter now resolves core through a local workspace link
  in development while publishing a normal semver dependency for adopters.
- Updated dependencies [e39adc8]
  - @seamless-auth/core@0.5.1
