# @seamless-auth/nextjs

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
