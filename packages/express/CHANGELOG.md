# @seamless-auth/express

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
