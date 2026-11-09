# @seamless-auth/nextjs

## 0.10.0

### Minor Changes

- c64cbd1: Verify Seamless webhooks. `@seamless-auth/core/webhook` adds `verifyWebhook`, which checks a Standard Webhooks `v1` signature against the raw body with a constant-time comparison, a 300 second timestamp tolerance in both directions and up to two secrets while one rotates, then returns the event typed with `WebhookEventSchema`. A refused webhook throws `WebhookVerificationError` with a `reason`. The adapters wrap it on their own `/webhook` subpath: `requireWebhook` middleware for Express, the `seamlessWebhook` plugin for Fastify, and `createWebhookHandler` and `verifyWebhookRequest` for Next.js. Core and the Next.js adapter now depend on `@seamless-auth/types` 0.40.0.

### Patch Changes

- Updated dependencies [4217eb5]
- Updated dependencies [c64cbd1]
  - @seamless-auth/core@0.26.0

## 0.9.0

### Minor Changes

- b4224ef: Deliver enrollment invites through adopter messaging (#183). With `messaging` configured, `POST /admin/enrollment/invites` now asks the auth API for external delivery (`x-seamless-auth-delivery-mode: external`, with the `seamless-auth-external-delivery` service token) and sends each invite in `results[].delivery` through `deliverAuthMessage`, so `handlers.sendEnrollmentInviteEmail`, `overrides.enrollmentInviteEmail` or the email transport send it instead of the auth API's mail system. Without `messaging` the route is unchanged.
  
  The response no longer carries `results[].delivery`, so recipient addresses and sign-in links are not echoed to the browser. A recipient whose delivery throws is reported as `{ "status": "skipped", "reason": "delivery_failed" }` and `sent` and `skipped` are adjusted; the other recipients are still sent and the route answers 200. The auth API has already recorded that recipient as invited, so repeating the call within a day reports them as `recently_invited`.
- b4224ef: Keep the session cookies when a refresh fails without the auth API refusing it, matching the Go adapter (fells-code/seamless-auth-go#22). The silent refresh on the auth routes and cookie-transport `POST /refresh` used to clear the access and refresh cookies on any failure, so a network blip or an auth API restart signed the browser out.
  
  The cookies are now cleared only when the auth API answers the refresh with 401, or the refresh cookie cannot be read. Those keep their current answers (`401 {"error":"Refresh failed"}` on a silent refresh, `401 {"error":"invalid_refresh_token"}` on `POST /refresh`). Otherwise the cookies stay and:
  
  - the auth API cannot be reached: `502 {"error":"upstream_unavailable"}`;
  - the auth API answers any other non-2xx status: that status and body pass through;
  - the rotated session fails verification, or a 2xx carries no session: `502 {"error":"upstream_unavailable"}`. `POST /refresh` answered these with 500 before.
  
  Core adds `refreshCookieSession`, which reports how a cookie rotation ended, and `failureBody`. `refreshAccessToken` keeps its signature. In-flight sharing and the 5 second window for a completed cookie rotation are unchanged, and only a successful rotation is kept. No request's abort signal reaches the upstream call, so a caller that goes away does not cancel a rotation other callers share.
- 5d33037: Add `requirePermission` guards, organization aware, on Express, Fastify and Next.js (#218). Needs the auth API at v0.23. `match` is `any` or `all`, `organization: true` counts only the active organization's permissions, and `organizationParam` also binds the check to the organization a route names. Matching is exact. A refusal is `403 insufficient_permission`, and an empty list opens nothing. A token carrying `permissions_omitted` has its permissions read from `GET /users/me/permissions` at the configured auth server URL, and `503 permissions_unavailable` fails closed when that read fails. The URL comes from `requireAuth`, or from an `authServerUrl` option for a cookie-only `requireAuth`.
  
  The guarded user now carries `permissions`, `organizationRoles`, `organizationPermissions` and `permissionsOmitted`. Core exports `authorizePermissions`, `permissionRequirement`, `INSUFFICIENT_PERMISSION` and `PERMISSIONS_UNAVAILABLE`, and every package exports `hasPermission` and `hasAllPermissions`.
  
  Resource servers gain the same guard: `api.requirePermission` on Express and Fastify, `permissions` and `permissionOptions` requirements on Next.js, and `authorizePermissions` on the verifier. Provider tokens do not carry these claims until seamless-auth-oidc-provider#47, so it denies every provider token today. `permissions_omitted` there is a 403, not a live read.
- 662b6aa: Let a verify-only resource server require a user rather than a client credentials token (#260). The Express and Fastify `requireAuth` guards from `createResourceServer` take `{ allowClients: false }`, the Next.js `protect` and `authenticate` requirements take `allowClients: false`, and core's `authenticate(authorization, { allowClients: false })` does the same. A verified token whose user has `isClient` set is then refused with `403 {"error":"user_required"}` and no `WWW-Authenticate` header, the same shape as `insufficient_role`. A token that fails verification still gets `401` first. `allowClients` defaults to `true`, so existing routes are unchanged.
  
  The shared verify-only vectors gain `is_client` on each accepted token and a `user_required_requests` list. Both are additive, so the Go, Python and Rust copies keep passing until those adapters implement the option.

### Patch Changes

- 662b6aa: Stop replaying a completed bearer refresh rotation to later callers (#258). After a successful rotation, the adapter used to hand the new session to any caller presenting the same old refresh cookie or bearer refresh token for the next 5 seconds, without calling the auth API, so a stolen bearer refresh token replayed in that window got the new tokens and the auth API's reuse detection never saw it.
  
  Bearer transport now shares only a rotation still in flight. A bearer client that presents a refresh token after its rotation completed goes to the auth API, which treats it as a replay and answers `401 {"error":"refresh_token_reused"}`.
  
  Cookie transport keeps the 5 second window, because browser tabs share one refresh cookie and a second tab sending the old cookie just after the first tab's rotation is expected. Within 5 seconds of a successful rotation the old refresh cookie gets the same rotated session; after that it goes to the auth API as a replay. A failed rotation is never kept, and the window is keyed on a hash of the cookie.
- 662b6aa: Mark client credentials tokens on the resource server user (#260). A user verified by `createResourceServer` now carries `isClient`, `true` when `sub` equals `client_id` (a machine acting for itself, whose `id` is a client id rather than a user id) and `false` otherwise. Code that builds a `ResourceServerUser` by hand, such as a test double, needs the new field.
- 0c2169d: Depend on `@seamless-auth/types` `^0.36.0`, which adds the session exchange contract.
- 5d33037: Depend on `@seamless-auth/types` `^0.38.0`, which adds the permission contract and matching.
- 662b6aa: Close a form-post CSRF gap on the auth routes (#256). A body-less form `POST` from a sibling subdomain, or from a browser that sends no fetch metadata, could reach cookie-authenticated routes such as `/recovery-codes` when cookies were `SameSite=Lax` or `Strict`.
  
  Requests now refused:
  
  - The origin check runs whatever the `SameSite` setting. A state-changing request with `Sec-Fetch-Site: cross-site` answers `403 {"error":"cross_site_request_blocked"}` under `Lax` and `Strict` too, and `allowedOrigins` is enforced for `same-site` and metadata-free requests under every setting. An empty `allowedOrigins: []` counts as configured. This also applies to the Next.js `requireAuth` and `requireRole` guards.
  - A state-changing request to the auth routes must declare `Content-Type: application/json` or carry an `x-seamless-auth-transport` header (any value), even with no body, or it answers `415 {"error":"unsupported_media_type"}`. `POST /refresh`, `DELETE /logout` and `DELETE /logout/all` are exempt for now, because the current browser client sends them bare; they still get the origin check. A client of your own that sends a body-less `POST`, `PUT`, `PATCH` or `DELETE` with no content type must add one of the two.
  
  Fastify accepts an empty body under `Content-Type: application/json` on the plugin's routes, and Express no longer reads one as `{}`, so a body-less JSON request forwards no body on all three adapters.
  
  `checkContentType` is exported from `@seamless-auth/core`. `checkOrigin` ignores its `cookieSecure` and `cookieSameSite` inputs.
- Updated dependencies [626dcc6]
- Updated dependencies [029c659]
- Updated dependencies [b4224ef]
- Updated dependencies [662b6aa]
- Updated dependencies [b4224ef]
- Updated dependencies [662b6aa]
- Updated dependencies [5d33037]
- Updated dependencies [662b6aa]
- Updated dependencies [662b6aa]
- Updated dependencies [0c2169d]
- Updated dependencies [5d33037]
- Updated dependencies [662b6aa]
  - @seamless-auth/core@0.25.0

## 0.8.0

### Minor Changes

- bdf2160: Passthrough routes come from the auth API's adapter manifest, and guard and not-found responses match the Go, Python and Rust adapters.
  
  Breaking response changes:
  
  - `requireAuth` answers `401 {"error":"unauthenticated"}` for a missing, invalid or expired session and for an ephemeral token. It used to answer `"Failed to find authentication token required"` or `"Invalid or expired session"`.
  - `requireRole` answers `403 {"error":"insufficient_role"}` when no listed role is granted, including for a user with no roles. The body no longer carries `required` and `actual`, so a client never sees the user's roles. A request no guard authenticated gets `401 {"error":"unauthenticated"}`.
  - In Express, a path under the auth router that no route and no manifest entry matches answers `404 {"error":"not_found"}` instead of calling `next()`. Fastify and Next.js already did.
  - `POST /users/update` is no longer served. The auth API has no such route, so it only ever answered the API's 404.
  
  The static passthrough tables are gone. Organizations, step-up, TOTP, credentials, OAuth provider configuration, admin organizations, enrollment, review accounts, the auth event export and integrity check, and the coverage report are served from the manifest, like any other route the adapter has no handler for. In cookie transport their bodies no longer carry `token` or `refreshToken`. A dot segment in one of their path parameters answers `404 not_found` rather than `400 bad_request`, and no upstream call is made either way. A recovery session that enrolls an authenticator app is still rotated right away.
  
  OTP verification, magic link polling and verification, and organization switching also drop tokens from a cookie-transport body when the auth API's answer is not a complete session.
  
  `setSeamlessLogger` and the `SeamlessLogger` type are exported from `@seamless-auth/express`, `@seamless-auth/fastify` and `@seamless-auth/nextjs`, and every warning and error those packages log goes through it.
- 82687e6: Next.js: add `requireAuth(handler, options)` and `requireRole(roles, handler, options)` to guard App Router route handlers. They accept the access cookie or the auth API's access token in `Authorization: Bearer`, verify the token against the auth API's key set (so roles come from a token the API signed), refuse recovery sessions unless `allowRecoverySession` is set, apply the origin check to cookie requests, and never refresh. Refusals answer `401 {"error":"unauthenticated"}`, `403 {"error":"enrollment_required"}`, `403 {"error":"cross_site_request_blocked"}` or `403 {"error":"insufficient_role"}`, without naming any roles. The user handed to the route carries `organizationId` from the token's `org_id`. A role guard with no roles throws at setup.
  
  Next.js: add a `trustedProxies` option (addresses or CIDR ranges) that reads the client IP from `X-Forwarded-For`, walking from the right past your proxies, when `resolveClientIp` is not given. Nothing is forwarded when neither is set, as before, but the handler now logs one warning at startup saying so. `getSeamlessSession` takes the request `headers` with `trustedProxies` or `resolveClientIp` and forwards the client IP, and reads the user agent from them when `userAgent` is not given.
  
  Core: `authenticateBearer` and `authenticateRequest` (with bearer verification on) set `organizationId` on the user from the verified access token's `org_id`. The new `GuardUser` type describes it.

### Patch Changes

- 241a207: `verifyRefreshCookie` accepts only a refresh cookie: a signed payload with a non-empty `sub` and `refreshToken` and no upstream `token`. Every adapter cookie is signed with the same secret, so before this a pre-auth, registration or access cookie placed in the refresh cookie slot verified too, and `hasSeamlessSession` in `@seamless-auth/nextjs` reported a session for it. Refresh cookies issued by earlier versions already have this shape and keep working.
- 3096144: Calls to the auth API now behave the same as in the Go, Python and Rust adapters.
  
  - OTP generation and magic link requests use `POST`. The `GET` routes they called are deprecated in the auth API and missing from its adapter manifest.
  - Every call times out after 15 seconds (`timeoutMs` on `authFetch`). An auth API that cannot be reached or does not answer in time gets `502 {"error":"upstream_unavailable"}` instead of a hung request or `500 internal_error`.
  - The key set is fetched from `authServerUrl` with its path kept, so an auth API mounted under a prefix such as `https://example.com/auth-api` is verified against its own keys.
  - `/registration/register` verifies the registration token (issuer, audience, `typ` `ephemeral`, and a `sub` matching the body) before it sets the registration cookie or returns the token to a bearer client, and answers `502 {"error":"invalid_upstream_session"}` when it fails.
  
  Breaking for code that calls `registerHandler` from `@seamless-auth/core` directly: `RegisterOptions` now requires `audience` and accepts `authServerIssuer`, like `LoginOptions`. The express, fastify and nextjs adapters pass both already.
- Updated dependencies [bdf2160]
- Updated dependencies [82687e6]
- Updated dependencies [241a207]
- Updated dependencies [3096144]
  - @seamless-auth/core@0.24.0

## 0.7.0

### Minor Changes

- 6b8e205: `EmailMessage` carries an optional `headers` record, taken from `@seamless-auth/types` 0.34.0, so an override or a custom transport can send headers such as `List-Unsubscribe` and `List-Unsubscribe-Post`. Core passes an override's headers to the email transport untouched; `@seamless-auth/messaging-aws` sends them through SES v2 and validates the names and values.
  
  `SendEnrollmentInviteEmailInput` now comes from `@seamless-auth/types` rather than being declared in core, and the Express, Fastify and Next.js adapters export it alongside the other messaging types.
- 397d74d: Rotate a recovery session right after it enrolls a factor. In cookie transport, a 2xx from `POST /webAuthn/register/finish` or `POST /totp/enroll/verify` made with a recovery session (`recovery: true` on the access token) now refreshes the session and sets new access and refresh cookies on the same response, so `requireAuth` stops answering `enrollment_required` at once, as the Go, Python and Rust adapters already do. When a silent refresh earlier in the request already rotated the session, the refresh token it issued is the one used, so the auth API never sees a replay; the cookies from that silent refresh are replaced rather than sent twice. If the refresh fails the enrollment answer is unchanged. Bearer transport is unchanged. Core exports `refreshAfterRecoveryEnrollment` and `refreshSessionToken`.
- bec9b80: Add verify-only resource servers for APIs that receive the OpenID Provider's access tokens (RFC 9068). `createResourceServer({ issuer, audience })` needs no cookie secret, service secret or auth routes: it finds the provider's keys through discovery (or `jwksUri` / `jwks`), checks `iss`, `aud`, the `at+jwt` header and the token's claims, and refuses a sender-constrained (`cnf`) token unless a `confirm` hook accepts it.
  
  Express and Fastify get `requireAuth()`, `requireScope()`, `requireRole()` and `requireStepUp()` guards; Next.js gets `protect(handler, { scopes, roles, stepUp })` and `authenticate(request)`. `requireStepUp({ acrValues: ["phr"], maxAge: 300 })` answers with the RFC 9470 `insufficient_user_authentication` challenge. The verified user carries `clientId`, `scopes`, `sid`, `orgId`, `acr`, `amr` and `authTime`, and `request.user` is widened with those as optional fields. `GuardRejection` gains optional `headers`.
  
  Every Seamless adapter (these, Go, Python and Rust) answers the same signed vectors in `packages/core/tests/fixtures/verify-only` the same way.

### Patch Changes

- 8ab9756: Serve `POST /system-config/oauth-providers/{id}/discovery` from the bundled manifest, so an adapter that cannot fetch the live manifest still reaches the auth API route that reads an OAuth provider's discovery document again. Account notice deliveries accept the `application_notice` notice from `@seamless-auth/types` 0.34, and `SendAccountNoticeEmailInput` and `SendAccountNoticeSmsInput` carry the optional `application` (`clientId` and `name`) the auth API sends with it, for a handler or override that renders its own template. `AccountNoticeApplication` is re-exported.
- fc84583: Serve a proxied access route on the same request that silently refreshed the session. When a cookie-transport request carried only the refresh cookie, `ensureCookies` refreshed the session but `checkProxyIdentity` still looked for the access cookie on the incoming request and answered 401 `access session required`, so the first request after the access cookie expired failed and only the retry worked. A session refreshed earlier in the request now satisfies the `access` identity, for passthrough routes and manifest routes in Express, Fastify and Next.js. A refreshed session still never stands in for a pre-auth or registration cookie. The `user` that `ensureCookies` returns carries `refreshed: true` after a silent refresh.
- f9605c5: Depend on `@seamless-auth/types` `^0.34.0`, the stable release, instead of the 0.34.0 prerelease.
- Updated dependencies [4d42ba4]
- Updated dependencies [6b8e205]
- Updated dependencies [8ab9756]
- Updated dependencies [e3b3949]
- Updated dependencies [fc84583]
- Updated dependencies [397d74d]
- Updated dependencies [f9605c5]
- Updated dependencies [bec9b80]
  - @seamless-auth/core@0.23.0

## 0.6.0

### Minor Changes

- 0e554e3: Check `Origin` against `allowedOrigins` even when `Sec-Fetch-Site` is present. A `same-site`
  request also covers sibling subdomains, so with `SameSite=None` cookies the header alone let any
  subdomain drive a state change. When `allowedOrigins` is configured, a state-changing `same-site`
  request must now carry an `Origin` on the list (a missing `Origin` is refused). `same-origin`
  requests always pass and `cross-site` requests are always refused.

  This tightens behavior for adopters who set `allowedOrigins`: list every origin that calls the
  adapter from a sibling subdomain. With `allowedOrigins` unset the default is unchanged, and a
  `same-site` request passes as before.

- 0e554e3: Refuse known placeholder secrets at startup. `assertSecretStrength` now refuses
  `dev-only-cookie-signing-key-replace-me`, `GRAB_FROM_SEAMLESS_AUTH_PORTAL_DEV`, and any value
  containing `replace-me`, which were long enough to pass the length check. Every adapter refuses one
  for `cookieSecret` or `serviceSecret` when it starts, unless it runs in its insecure local mode
  (`cookieSecure: false`). `assertSecretStrength` takes a new `{ allowPlaceholder }` option and
  `assertSecrets` reads `cookieSecure`; core also exports `isPlaceholderSecret` and
  `KNOWN_PLACEHOLDER_SECRETS`.

  `requireAuth` (and `authenticateRequest`) configured with `authServerUrl` and `audience` now also
  verifies the access token inside the cookie against the auth API's JWKS, and takes the session's
  roles from it, so a cookie forged with the cookie secret alone cannot carry claims of its own.
  Without that configuration the guard decodes the inner token as before.

- 5ebc6a2: Support for the auth server's v0.20 account recovery, built on `@seamless-auth/types` 0.31.0.

  - **Recovery sessions are refused by default.** An access token from account recovery or a recovery code carries `recovery: true` and can only enroll a new passkey or authenticator app. `requireAuth` (Express, Fastify) answers it with `403 { "error": "enrollment_required" }`, and the Next.js `getSeamlessSession` and `getSeamlessClaims` treat it as signed out, unless `allowRecoverySession: true` is passed. Set it only where the app drives that enrollment. After enrolling, a refresh issues a token without the claim.
  - **Account notices.** On routes the auth server's manifest marks `notices: true` (today `POST /recovery/verify`), an adapter with `messaging` names the notice kinds it can send in `x-seamless-auth-delivery-kinds` and delivers the `account_notice_email` / `account_notice_sms` items the server returns. These items are its "recovery opened" notice with a cancel link, which goes only to the owner and is never logged. If none goes out, the adapter cancels the request with that link's token and answers `503 recovery_notice_failed`, so recovery never runs without the owner being told. New `handlers.sendAccountNoticeEmail` / `sendAccountNoticeSms` and `overrides.accountNoticeEmail` / `accountNoticeSms`; the default sends the server's text as plain text.
  - An OTP sent for account recovery (`purpose: "account_recovery"`) is worded as a recovery code, and the purpose is passed to custom OTP handlers and overrides.
  - The bundled fallback manifest now includes the v0.20 routes, including the recovery, recovery code and staged policy routes.

### Patch Changes

- 0e554e3: Check the token type before trusting a token. `ensureCookies` now refuses an access cookie whose
  inner token is not an access token (`typ: "access"`), as `requireAuth` already did, so a signed
  pre-auth cookie copied into the access slot is answered 401. `verifyUpstreamSession` refuses a
  response whose token has the wrong `typ`: an access token for session flows, and an ephemeral
  token for `/login` and the manifest's pre-auth and registration routes (new optional
  `expectedType` argument). Core also exports `holdsAccessToken`.
- 0e554e3: Keep the API's framing and content-type headers on the console proxy. The proxy now forwards
  `Content-Security-Policy`, `X-Frame-Options` and `X-Content-Type-Options` from the API, and when
  the API sends neither of the last two it sets `X-Frame-Options: DENY` and
  `X-Content-Type-Options: nosniff` (unless the application already set them), so the admin console
  served on the app origin cannot be framed.
- 0e554e3: Do not follow redirects on upstream requests. `authFetch` now sends every auth API request with
  `redirect: "manual"` and answers a 3xx as a 502 with `{ "error": "upstream_redirect" }`, so a
  misconfigured proxy in front of the API can no longer get the service token and forwarded client
  headers resent to another origin. The adapter manifest fetch no longer follows redirects either,
  and falls back to the bundled copy instead.
- 0e554e3: Refuse empty, `.` and `..` route params on the hand-written passthroughs and core handlers with
  a 400 `bad_request`, as the manifest proxy already did. A decoded `%2e%2e` param previously stayed
  literal after encoding and moved the upstream path. Core exports `encodePathParam` and
  `InvalidPathParamError` for the shared rule.
- 98bd4e6: Update `@seamless-auth/types` to 0.33.0.
- Updated dependencies [0e554e3]
- Updated dependencies [0e554e3]
- Updated dependencies [0e554e3]
- Updated dependencies [0e554e3]
- Updated dependencies [0e554e3]
- Updated dependencies [98bd4e6]
- Updated dependencies [5ebc6a2]
  - @seamless-auth/core@0.22.0

## 0.5.1

### Patch Changes

- a4ef23f: Depend on `@seamless-auth/types` 0.29.0, which adds the optional OAuth state `binding` to the start response and callback request schemas. Apps now resolve a single copy of the types package alongside the client SDKs.
- Updated dependencies [a4ef23f]
  - @seamless-auth/core@0.21.1

## 0.5.0

### Minor Changes

- 5b009f1: Support the magic link confirmation step.

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

### Patch Changes

- Updated dependencies [5b009f1]
  - @seamless-auth/core@0.21.0

## 0.4.1

### Patch Changes

- 8ff942d: Publish declarations that resolve under `moduleResolution: "NodeNext"` and `"Node16"`. Relative imports in the shipped `.d.ts` files now carry explicit `.js` extensions. Consumers on NodeNext previously could not resolve them, so the exported functions typed as `any` (hidden by `skipLibCheck`). Runtime output is unchanged.
- dd5c0e5: The README examples read the service secret from `SEAMLESS_SERVICE_TOKEN` instead of `SERVICE_SECRET`. The auth server still reads `API_SERVICE_TOKEN`; both hold the same value. The adapters read no environment variables, so nothing changes at runtime.
- Updated dependencies [8ff942d]
  - @seamless-auth/core@0.20.1

## 0.4.0

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

- Updated dependencies [7f2e490]
- Updated dependencies [a16f216]
- Updated dependencies [5274afe]
- Updated dependencies [330c0fc]
- Updated dependencies [d285ffb]
  - @seamless-auth/core@0.20.0

## 0.3.1

### Patch Changes

- 0314dfa: Check a silently refreshed access token against `authServerIssuer`. The silent refresh in `ensureCookies` now verifies the token it returns, but it checked `iss` against `authServerUrl` even when `authServerIssuer` was set, so an app reaching the auth server at another URL (the local Docker stack from the host) answered 401 on every silent refresh and signed the user out. `EnsureCookiesOptions` and the Express `createEnsureCookiesMiddleware` take an optional `authServerIssuer`, and the adapters pass their configured one.
- ca8fa4a: Verify the access token a silent refresh returns before issuing cookies from it. `ensureCookies` refreshes an expired session on the auth routes and wrote the auth API's response straight into the access cookie, while every other flow that issues a session (login, OTP, OAuth, magic link, and the explicit `/refresh` route) first checks the token against the auth server's JWKS and confirms it names the same user as the body. The access cookie is signed with the application's own secret and its roles are trusted on every later request, so a refresh response that did not come from the auth server could become a trusted session. The silent refresh now runs the same check and answers 401, clearing the session cookies, when it fails. The session id is now read from the signed token's `sid` claim, as the other flows do.

  `EnsureCookiesOptions` and the Express `createEnsureCookiesMiddleware` take a new optional `accessTokenAudience`, the audience user access tokens are issued for. The adapters pass their configured `audience`. Code that calls `ensureCookies` or `createEnsureCookiesMiddleware` directly should pass it too; it defaults to `authServerUrl`.

- Updated dependencies [0314dfa]
- Updated dependencies [ca8fa4a]
  - @seamless-auth/core@0.19.1

## 0.3.0

### Minor Changes

- a004f89: Pass the auth API's audit and reporting routes through with the caller's access identity: `GET /admin/auth-events/integrity` (fells-code/seamless-auth-api#174), `GET /admin/auth-events/export` (fells-code/seamless-auth-api#173) and `GET /admin/reports/authentication-coverage` (fells-code/seamless-auth-api#178), each with its query.

  The export and the coverage report answer with a file (NDJSON, or CSV when `format=csv`), so proxied routes can now forward an upstream response unparsed. `proxyRequest` takes `raw: true` and returns `raw: { headers, body }`, holding the body stream and its `content-type`, `content-disposition` and `cache-control`. Each adapter streams it through as is, so the download keeps its type and filename rather than arriving wrapped in `{ message }`.

  `ResponseAdapter` gains a required `sendRaw(status, raw)`. A custom adapter that implements `ResponseAdapter` itself has to add it. The adapters in this repository already do.

  `@seamless-auth/types` is now `^0.27.0`.

- 79aad32: Add `authServerIssuer`, the expected `iss` of the tokens and signed responses the auth server returns. It defaults to `authServerUrl`, so nothing changes unless you set it. Set it when the auth server is reached at a different URL from the issuer it advertises: on the local Docker stack the auth server signs as `http://auth:5312`, while an app run on the host calls `http://localhost:5312`, and every sign-in failed with `Invalid signed response from Auth Server` (fells-code/seamless-cli#224). Requests and key set fetches still go to `authServerUrl`; only the `iss` check reads the new option.

  The auth API sets `aud` to its ISSUER as well, and `audience` stays required with no default, so with `authServerIssuer` set, set `audience` to the same value. For the Docker stack from the host that is `authServerUrl: "http://localhost:5312"`, `authServerIssuer: "http://auth:5312"`, `audience: "http://auth:5312"`. The option docs and READMEs now say this.

  It is accepted by `createSeamlessAuthServer`, `requireAuth` and `getSeamlessUser` in Express, the `seamlessAuth` plugin, `requireAuth` and `getSeamlessUser` in Fastify, and `createSeamlessAuthHandler` and `getSeamlessSession` in Next.js. In core, `verifySignedAuthResponse`, `verifyAccessToken` and `verifyUpstreamSession` take it as an optional last argument, and `getSeamlessUser`, `authenticateBearer`, `authenticateRequest` (under `bearer`), `issueSessionCookies`, `sessionResult` and the session-issuing handlers' options take it as a field (`AuthServerIssuerOption`).

  The startup warning for an unset or `dev-main` `jwksKid` now says what the value is: the `kid` header on the HS256 service tokens the adapter signs with `serviceSecret`, not the auth server's signing key. The READMEs describe `jwksKid` the same way.

- 6538393: Add `createSeamlessConsoleProxy`, which serves the Seamless admin console from a Next.js application. Mount it at `app/console/[[...path]]/route.ts` and export its `GET` and `HEAD`, and the dashboard loads from the same origin as `/auth`, as it does with the Express and Fastify console proxies. It forwards only the method and the path upstream, copies the caching headers back, and refuses any path that leaves the console subtree. A `mountPath` option covers a route mounted elsewhere or under a Next.js `basePath`. Closes #185.
- 629c428: - `GET /internal/metrics/dashboard` and `GET /internal/security/anomalies` now forward their query string, so the time range and paging the auth API accepts on them reach it (fells-code/seamless-auth-api#132). Before, both handlers were built without a query, and a range from the dashboard was silently dropped. `getDashboardMetricsHandler` and `getSecurityAnomaliesHandler` accept `query`.
  - Pass `GET /admin/review-accounts` (with its `days` query) through to the auth API with the caller's access identity (fells-code/seamless-auth-api#331).

### Patch Changes

- 9dbd345: Recover when the auth server starts signing with a new key under the same `kid`. The cached key set was only refetched for an unknown `kid`, so after such a change (a recreated local auth container regenerates its dev key this way) every signed auth response and Bearer token failed verification for up to 10 minutes, and sign-in answered 500 until the application restarted. A signature that does not match a cached key now refetches the key set once and verifies again, at most once per 30 second cooldown so a stream of bad signatures cannot hammer the JWKS endpoint. The verification failure log now includes the `jose` error code. Fixes #184.
- da7f33f: Support Node 22 and newer. The `engines` field now requires `>=22` instead of `>=24 <25`, and CI runs on Node 22, 24, and the latest release (fells-code/seamless-auth-api#339).
- 4006a5b: Depend on `@seamless-auth/types` `^0.28.0`, which adds the ranged dashboard metrics and security anomalies schemas (fells-code/seamless-auth-api#132).
- Updated dependencies [a004f89]
- Updated dependencies [79aad32]
- Updated dependencies [9dbd345]
- Updated dependencies [da7f33f]
- Updated dependencies [629c428]
- Updated dependencies [4006a5b]
  - @seamless-auth/core@0.19.0

## 0.2.0

### Minor Changes

- b7d40bb: Pass `GET /admin/enrollment` (with its query) and `POST /admin/enrollment/invites` through to the auth API with the caller's access identity. They report passkey enrollment progress and send enrollment invites (fells-code/seamless-auth-api#338).

### Patch Changes

- daaffbc: Depend on `@seamless-auth/types` `^0.26.0` (core was on `^0.4.0`, the Next.js adapter on `^0.25.0`). `deliverAuthMessage` now delivers the `enrollment_invite_email` kind: a default email linking to the sign-in page, an optional `handlers.sendEnrollmentInviteEmail`, and an optional `overrides.enrollmentInviteEmail`. A delivery kind the adapter does not recognize is now logged as a warning instead of being dropped silently.
- 03e5a4a: Send no body on a 204, 205, or 304. The auth API answers a successful passkey enrollment (`/webAuthn/register/finish`) with 204, and the handler attached its usual `{ message: "success" }`. Express and Fastify drop a body on those statuses; the `Response` constructor throws, so passkey enrollment failed with a 500.
- 2c626a9: Stop silently refreshing a route that needs a pre-auth or registration cookie. When `/webAuthn/login/start`, `/webAuthn/login/finish` or another pre-auth or registration route was called without its cookie, `ensureCookies` spent the refresh token and wrote the resulting access token under that route's cookie name. The next attempt then forwarded an access token to a route the auth API gates on an ephemeral token, and passkey login answered 401 (`JWT typ mismatch`). Such a route now answers 401 without touching the refresh cookie, since a refresh can only produce an access token. Fixes #154.
- Updated dependencies [daaffbc]
- Updated dependencies [b7d40bb]
- Updated dependencies [2c626a9]
  - @seamless-auth/core@0.18.0

## 0.1.0

### Minor Changes

- c8db0ca: Add `@seamless-auth/nextjs`, an adapter for the Next.js App Router.

  - `createSeamlessAuthHandler(options)` returns the `GET`, `POST`, `PATCH`, and `DELETE` handlers for an `app/auth/[...seamless]/route.ts` catch-all. It serves the same routes and issues the same cookies as the Express and Fastify adapters, cookie and bearer transport both.
  - `getSeamlessSession(cookies, options)` resolves the signed-in user for a server component, in the shape `@seamless-auth/react`'s `AuthProvider` takes as `initialSession`. It verifies the access cookie locally and never refreshes.
  - `hasSeamlessSession` and `getSeamlessClaims` check the cookies locally, with no network call, for route protection in `proxy.ts`.

- e0cab5c: Relicense from AGPL-3.0-only to the Apache License, Version 2.0 (fells-code/seamless-auth-api#335). The `LICENSE` file, the `license` field and the license header in source files now say Apache-2.0, and the AGPL summary in `LICENSE.md` is removed.

### Patch Changes

- 5209e57: Type `getSeamlessSession`'s result as the `/users/me` wire type from `@seamless-auth/types`, the same one `@seamless-auth/react`'s `AuthProvider` takes as `initialSession`. Its credentials and organizations were typed as `unknown[]`, so passing the result to `initialSession` failed to type-check.
- Updated dependencies [e0cab5c]
  - @seamless-auth/core@0.17.0
