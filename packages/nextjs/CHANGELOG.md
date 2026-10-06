# @seamless-auth/nextjs

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
