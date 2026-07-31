# @seamless-auth/core

## 0.12.0

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

## 0.11.0

### Minor Changes

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

- 9735f83: Export the remaining handlers and verifiers from the package root.

  The admin, session, internal-metrics, and system-config handlers, along with `verifySignedAuthResponse` and `verifyRefreshCookie`, were reachable only through a subpath import. Everything else came from the root, so which import an adapter needed depended on which handler it wanted. 27 names are now available from `@seamless-auth/core` as well.

  Purely additive. Nothing is removed or renamed, the `./handlers/*` subpaths keep working, and a test asserts that a subpath import and a root import resolve to the same function rather than two copies.

  The README's public API overview is rewritten to match, grouped by what an adapter author is looking for, and now covers the response contract, proxy, delivery, and contract-value exports added earlier in this epic that it had never listed.

  Part of #72.

- 17c5487: Move auth message delivery into `@seamless-auth/core`.

  `deliverAuthMessage`, `applyExternalDelivery`, and `stripDelivery` lived in the Express adapter but had no framework coupling: their only imports were the messaging types, which already came from core. Every future adapter would have had to reimplement or copy them. They now sit beside the messaging contract in core and are exported from the package root, and the adapter imports them.

  `applyExternalDelivery`, `deliverAuthMessage`, and `stripDelivery` are new named exports of `@seamless-auth/core`. Nothing is removed from `@seamless-auth/express`: the three helpers were internal to it and were never exported.

  The warning logged when external delivery is requested but the auth API returns no delivery payload is now prefixed `[SeamlessAuth]` rather than `[SEAMLESS-AUTH-EXPRESS]`, matching the rest of core. The text is unchanged. Anything matching on that prefix in log processing needs updating.

  Part of #72.

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

- c52b5d1: Take `@seamless-auth/types` 0.4.0.

  That release adds a `z.infer` alias for each of the 43 exported schemas that
  lacked one, so the naming convention now covers all 123. It is additive: no
  existing export changed name or shape, and nothing core imports from the package
  moved. Core keeps importing the same type names it always has.

  Adopters who resolve `@seamless-auth/types` through core pick up the new aliases
  and can name a response body without adding a direct `zod` dependency to call
  `z.infer` themselves.

- 9e04625: Take the remaining duplicated types from `@seamless-auth/types`.

  `SeamlessUser` is now an alias of the types package's `MeUser`, and the eight messaging wire shapes (`MessagingChannel`, `DeliveryResult`, `EmailMessage`, `SmsMessage`, `SendOtpEmailInput`, `SendOtpSmsInput`, `SendMagicLinkEmailInput`, `AuthDeliveryInstruction`) are re-exported rather than declared again. Each was field for field identical to a definition that already existed upstream, which is the drift `@seamless-auth/types` exists to prevent.

  What stays declared here is what genuinely belongs to this package: the transport interfaces, which carry provider implementations, and the adopter-facing configuration (`EmailTransport`, `SmsTransport`, `AuthMessageOverrideContext`, `AuthMessageOverrides`, `AuthMessagingHandlers`, `SeamlessAuthMessagingOptions`).

  No public API change and no runtime cost. Every name is still exported from `@seamless-auth/core` and both adapters, the re-exports are type-only so they are erased at compile time, and the built output still imports only `@seamless-auth/types/role/matching` at runtime, so neither `zod` nor the schema barrel enters the module graph.

  Closes #133.

- 82fc15a: Return a code instead of an empty response when the auth API fails with no body.

  The auth-flow routes forward the API's failure body rather than interpreting it, and an empty body left nothing to forward: the caller got a bare 4xx with no content, and `seamless-auth-react` fell back to its per-call generic message with no way to tell an expired session from a rate limit from an upstream outage. The proxy routes already handled this, so the two families disagreed on the one case where the caller had least to go on.

  An empty failure body now becomes `{ "error": "upstream_error" }`. A body that is present is still forwarded untouched, including the top-level `code` the React SDK reads to tell OAuth failures apart.

  New exports: `readPassthroughFailure` and `UPSTREAM_ERROR_CODE`.

  Closes #125.

- d7d408d: Extract the copy-pasted session helpers, with a typed `UpstreamSessionResponse`.

  Seven handlers repeated the same block: verify the signed access token, check it describes the same subject as the response body, read the `sid` claim, then build the access and refresh cookie payloads. Seven copies of a security-relevant check is seven places to get an early return wrong, and the upstream fields were read untyped, so a rename on the API side surfaced as an undefined cookie field at runtime rather than a type error.

  `issueSessionCookies` now does the whole thing in one call, `verifyUpstreamSession` is available for the one flow that verifies without issuing a session (login, which issues only the pre-auth cookie), and `UpstreamSessionResponse` states what the auth API returns when it issues a session. The handlers drop 220 lines.

  One behavior change: the access cookie issued by `POST /webAuthn/register/finish` now carries `organizationId: null` where it previously omitted the key. Every other flow already included it, and the refresh path writes it on every reissue, so that session disagreed with itself after a single refresh. It is now consistent from the start.

  New exports: `issueSessionCookies`, `verifyUpstreamSession`, `UpstreamSessionResponse`, `VerifiedUpstreamSession`, `IssueSessionCookiesOptions`.

  Closes #136.

- 744418b: Let adopters route this package's diagnostics somewhere other than `console`.

  Core wrote to `console` directly, so an adopter could not capture, level, or silence its output. An adapter with its own logger still leaked core's lines to `console`, which meant one request could produce output in two places.

  `setSeamlessLogger(logger)` accepts anything with `warn` and `error`, which a platform logger already satisfies, and `setSeamlessLogger()` with no argument goes back to `console`. Nothing changes for callers that do not set one.

  The logger is process-wide, not per-request, so it changes where core's diagnostics go rather than attaching request context to them. Core logs two things (a failed signature verification and a misconfigured external-delivery setup), and neither depends on request context. Threading a per-request logger through every handler would be a larger change.

  New exports: `setSeamlessLogger`, `getSeamlessLogger`, `SeamlessLogger`.

  Closes #137.

- 583271a: Preserve the upstream error detail on the admin, session, internal-metrics, and system-config proxy routes.

  These handlers read the failure code out of the upstream body's `error` key and fell back to a constant (`admin_request_failed`, `session_request_failed`, `internal_request_failed`, `failed_to_fetch_roles`, `failed_to_fetch_config`, `failed_to_update_config`) whenever that key was missing. The auth API answers a validation failure with a Zod body shaped `{ name, message }` and no `error` key, so every validation failure collapsed to the constant. A `PATCH /admin/users/:id` rejected for its `phone` field came back as `{"error":"admin_request_failed"}`, with nothing naming the field, and the detail was not recoverable from the API's request logs either.

  The handler results and the Express responses now carry the upstream detail. `error` is the upstream `error` string when present, otherwise the upstream `message` string, and only then the constant fallback for an empty or non-JSON-object body. A new optional `details` field carries the parsed upstream body whenever it holds more than the derived `error` string, so a Zod body reaches the caller intact.

  This is additive: a response that already carried an upstream `error` code is unchanged and gains no `details` key. Callers that switch on the constant fallback for validation failures should read `details` (or the now-descriptive `error`) instead.

- a5e3070: Take the scoped-role matching from `@seamless-auth/types` instead of maintaining a second copy.

  `packages/core/src/scopedRoles.ts` reimplemented the same logic as the auth API's `src/lib/scopedRoles.ts`. They agreed, but nothing kept them in step, and they are the two places that decide whether a request is authorized. A divergence there means the API and an adopter's server disagree about who can do what. Both sides now take `roleGrantsAccess` and `hasScopedRole` from `@seamless-auth/types`, so there is one definition.

  No public API change. `@seamless-auth/core` exports the same two names, and `@seamless-auth/express` already re-exported them from core. Behavior is unchanged: the replacement was checked against the deleted implementation over every granted/required pair built from a 594-string role corpus (352,836 pairs), including wildcard grants, unscoped grants, write-implies-read, empty and whitespace-padded roles, and non-array or non-string `grantedRoles`, with no differences.

  Core imports the `@seamless-auth/types/role/matching` entry point, which carries the matching helpers with no dependencies of its own, so this adds nothing to what an adopter loads at runtime: `zod` stays out of the module graph and cold `import` of `@seamless-auth/core` is unchanged.

## 0.10.0

### Minor Changes

- fa1c736: Remove the admin bootstrap invite flow from the adapter.

  The Seamless Auth API dropped the flow, so `POST /internal/bootstrap/admin-invite` no longer exists upstream and the API never emits a `bootstrap_invite_email` delivery. Everything the adapter carried for it was unreachable: the proxy route returned whatever the upstream 404 produced, and the delivery branch could not be selected. The first admin is now granted through the API's `OWNER_EMAIL` instead.

  BREAKING: `bootstrapAdminInviteHandler` (`@seamless-auth/core/handlers/bootstrapAdminInvite`) and the `SendBootstrapInviteEmailInput` type are gone, `AuthMessagingHandlers.sendBootstrapInviteEmail` and `AuthMessageOverrides.bootstrapInviteEmail` are removed, and `bootstrap_invite_email` is no longer a member of `AuthDeliveryInstruction`. Adopters passing a `sendBootstrapInviteEmail` handler or a `bootstrapInviteEmail` override should drop it; `handlers` is a `Partial`, so nothing else needs to change. Callers of the `/internal/bootstrap/admin-invite` route get a 404 from the adapter now rather than from the upstream API.

  The `bootstrapToken` entries in the core redaction patterns stay. They are a log-scrubbing denylist, and keeping a stale term only makes scrubbing more conservative.

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

- d3e9274: Post-release follow-up cleanups from the pre-release audit.

  - Bound the refresh-result cache in core. Entries were keyed by the rotating refresh cookie and never revisited, so the map grew without limit and retained tokens for the process lifetime. It now sweeps expired entries (throttled) and caps total size.
  - Memoize the JWKS key set per auth-server URL in `verifySignedAuthResponse`. It was rebuilt on every call, so jose's key cache and refetch cooldown never engaged and every verification made an extra request to `/.well-known/jwks.json`.
  - `SeamlessAuthUser.email` is now optional and `phone` is `string | null`, matching the cookie payload and the upstream `/users/me` shape. This is a type-level change: consumers that treated `phone` as a non-null `string` will need to handle `null`.
  - Export `redactSensitiveText` from core and use it to mask tokens and secrets before the Express router logs an unhandled error.
  - Reorder the `/magic-link/check` cookie requirement so it is no longer shadowed by `/magic-link`, throw a clear error when a route parameter is missing instead of forwarding the literal string `"undefined"`, correct the `Missing cookieSecret` message that named a removed environment variable, and drop a redundant terminal `.end()` after `res.json(...)`.

- 2627da4: Send a genuine machine-to-machine service token on proxied routes, and derive the forwarded client IP from a trusted hop.

  `authFetch` no longer falls back to `authorization` when no `serviceAuthorization` is given, so the browser user's access token is never placed in the `x-seamless-service-token` header. The user's identity now travels in `Authorization` only. `serviceAuthorization` is accepted by every core handler that already accepted `forwardedClientIp`.

  The Express adapter mints a real HS256 service token for proxied routes, signed with the configured `serviceSecret` and carrying the fixed `iss`/`aud` the auth server requires. The auth server only honors `x-seamless-client-ip` when a valid service token accompanies it, so client IP forwarding previously no-opped: IP-keyed rate limiters and audit records attributed proxied requests to the adapter's egress IP instead of the end user's. Tokens are reused for 45 seconds rather than signed per request.

  The forwarded client IP is now validated as a real IP address, and is dropped when Express `trust proxy` is set to blanket `true`, since `req.ip` is then taken from a client-supplied `X-Forwarded-For`. Set `trust proxy` to an explicit hop count or subnet. A new `resolveClientIp` option lets adopters derive the address themselves when their topology needs it.

### Patch Changes

- 9bae2bf: Register `/users/update`, `/users/credentials`, `/sessions`, and `/admin/credential-count` in the core cookie requirements table. Without these entries the ensureCookies middleware never populated `req.cookiePayload`, so `/users/update` and `/users/credentials` returned 401 and `/sessions` and `/admin/credential-count` failed to forward the access token upstream.
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

- 4748a6b: Forward the service token from `getSeamlessUser`, so the client IP it sends is honored again.

  `GetSeamlessUserOptions` did not declare `serviceAuthorization` and the core `authFetch` call never passed it. The Express adapter still computed the service token and passed it, but an `as GetSeamlessUserOptions` cast on the option literal discarded it without a type error. Every `getSeamlessUser` call therefore sent `x-seamless-client-ip` with no accompanying service token, and the auth server ignores the forwarded IP unless a valid service token rides with it. Rate limiting, lockout, and anomaly detection attributed those requests to the adapter's egress IP instead of the end user's. This restores the behavior added in 0.7.0.

  `GetSeamlessUserOptions.authorization` is now optional, which matches what the adapter already passed: it resolves the user's access token from `req.cookiePayload` or `req.user`, both of which are unset when `getSeamlessUser` is called outside the auth router or the `requireAuth` guard. The required type was only satisfied by the same cast that hid the dropped service token.

- c2746aa: Stop the cookie gate from rejecting cross-device magic-link verification. `/magic-link/verify/:token` was prefix-matched by the `/magic-link` pre-auth cookie requirement, so a link opened on a device without the pre-auth or refresh cookie returned `400 Missing required cookie`. The token in the verify URL is the credential, so that route is now explicitly ungated while `/magic-link` (request) and `/magic-link/check` (poll) keep requiring the pre-auth cookie.
- e9bd7a1: Fix assorted correctness bugs:

  - Magic link polling no longer returns a body with its 204 response. Express strips bodies on 204, so the message was never delivered. The 204 status is unchanged.
  - `getSeamlessUser` no longer throws when the auth server returns a 200 with an empty body. It resolves to null instead.
  - `/internal/auth-events/grouped` now forwards query params to the auth server, matching the summary and timeseries routes. Grouping and filter params were previously ignored.
  - The bootstrap admin invite handler now surfaces string-shaped upstream errors instead of falling back to `bootstrap_failed`, and no longer throws when the request has no parsed body.

- 3296263: Proxy the new OAuth provider admin routes to the auth API: `GET`/`POST /system-config/oauth-providers` and `PATCH`/`DELETE /system-config/oauth-providers/:id`, all gated on the access identity. Register `/system-config/oauth-providers` in the core cookie requirements table so the ensureCookies middleware populates `req.cookiePayload` for both the collection and the id-scoped routes; without it the proxy never attaches the access token and the routes fail closed.
- c53ab04: Correct published package metadata. Both packages now declare `engines.node` matching the Node 24 repo baseline, point `repository.url` at the repo root with a `directory` field, and declare a `bugs` URL. The express package gains the `homepage` field the core package already had.
- 44f98d0: Close two path-encoding containment gaps.

  The Express console proxy relied on `new URL` normalizing `..` segments to keep requests inside the mounted subtree, but WHATWG `URL` does not decode `%2f` or `%5c`, so `/console/..%2fadmin/users` passed the prefix check and was forwarded upstream verbatim where a decoding upstream could escape the console subtree. The proxy now rejects any subpath containing an encoded path separator with a 400.

  The core `verifyMagicLinkHandler` interpolated its token into the upstream path without `encodeURIComponent`, unlike every sibling handler. A caller wiring it to a route param could send a traversal- or query-shaped token that reshaped the upstream request while carrying the caller's service authorization. The token is now encoded to a single path segment.

- 49e31f9: Pre-release documentation and metadata corrections. The `requireRole` JSDoc example no longer calls `requireAuth()` with no arguments (which does not compile and throws), its malformed code fence is closed, and it now shares a constructed guard. The README Quick Start startup log matches its listen port, the `createSeamlessAuthServer` options block lists the `resolveClientIp` option, and the end-to-end flow references the real `webAuthn/login/finish` route. Both packages now declare `keywords` for npm discoverability.
- c7f6a98: Bind the configured `audience` when verifying signed auth responses. `verifySignedAuthResponse` now enforces the `aud` claim in `jwtVerify`, and the login, finishLogin, finishRegister, OAuth, OTP, magic-link, and switch-organization handlers thread `SeamlessAuthServerOptions.audience` through to it. Previously only the issuer was checked, so on a multi-relying-party auth server a token minted by the same issuer for a different application would pass verification and be accepted as this app's session.

## 0.7.0

### Minor Changes

- 07c9837: Issue a session on OTP-based registration. Registration now starts with just an
  email, and verifying the registration email OTP completes sign-up and returns a
  session. The adapter previously proxied `/otp/verify-email-otp` and
  `/otp/verify-phone-otp` without setting cookies, so browser users finished
  registration unauthenticated. A new `verifyRegistrationOtpHandler` (core) plus a
  `verifyRegistrationOtp` express handler now set the session cookies on these
  routes (tolerating a phone-first step that returns no session yet), mirroring the
  login OTP verify handlers.
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
- 26ba2e3: fix: updates core implementation to supply the authorization value during polling for magic links
- 70cf1c2: Fixes for deleting users as an admin, and internal auth events summary route token handling

## 0.6.0

### Minor Changes

- 3cf132e: Issue a session on OTP-based registration. Registration now starts with just an
  email, and verifying the registration email OTP completes sign-up and returns a
  session. The adapter previously proxied `/otp/verify-email-otp` and
  `/otp/verify-phone-otp` without setting cookies, so browser users finished
  registration unauthenticated. A new `verifyRegistrationOtpHandler` (core) plus a
  `verifyRegistrationOtp` express handler now set the session cookies on these
  routes (tolerating a phone-first step that returns no session yet), mirroring the
  login OTP verify handlers.

### Patch Changes

- e52ff77: Don't crash on non-JSON upstream responses. `authFetch` now parses response bodies
  defensively, so a plain-text error (e.g. a rate-limited `429 Too many requests`) or an
  empty body (`204`) no longer throws in handlers that read the body before checking the
  status — which previously surfaced as an unhandled rejection that took down the adapter
  process. Non-JSON bodies are returned as `{ message: <text> }`; empty bodies as
  `undefined`. Fixes #41.
- 39f7aad: fix: updates core implementation to supply the authorization value during polling for magic links
- 46f4f02: Fixes for deleting users as an admin, and internal auth events summary route token handling

## 0.5.4

### Patch Changes

- b4a1491: fix: updates core implementation to supply the authorization value during polling for magic links
- f3206ea: Fixes for deleting users as an admin, and internal auth events summary route token handling

## 0.5.3

### Patch Changes

- 3d979b1: Fixes for deleting users as an admin, and internal auth events summary route token handling

## 0.5.2

### Patch Changes

- ac96299: Operational tidy work and extension of the logout functions for future use

## 0.5.1

### Patch Changes

- e39adc8: Move package development and release management to a pnpm workspace backed by
  Changesets. The Express adapter now resolves core through a local workspace link
  in development while publishing a normal semver dependency for adopters.
