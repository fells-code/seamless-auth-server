# @seamless-auth/core

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
