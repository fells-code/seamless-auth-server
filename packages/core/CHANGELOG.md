# @seamless-auth/core

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
