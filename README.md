# Seamless Auth Server Packages

Seamless Auth is an open source, passwordless authentication system designed to be embedded directly into applications.

It provides a small, explicit core and framework-specific adapters that make it easy to integrate secure, session-based authentication into APIs and web applications without opaque middleware chains. Native passwordless flows stay embedded in your app, while optional OAuth routes let adopters add external identity providers when their product or enterprise customers need them.

This repository contains the core building blocks and official server-side framework integrations.

---

## Philosophy

Seamless Auth is built around a few guiding principles:

- **Passwordless by default**
  Authentication is based on possession and verification, not shared secrets.

- **Embedded authentication**
  Native Seamless Auth flows live inside your application. OAuth redirects are available as an optional bridge to external identity providers.

- **Server-side session validation**
  Sessions are managed using secure, HTTP-only cookies and validated by the API.

- **Explicit over magical**
  Authentication and authorization are enforced with clear, composable middleware.

- **Self-hosted and open source**
  You control the infrastructure and the data.

---

## Packages

This repository is structured as a small core plus framework adapters.

### @seamless-auth/core

The core package contains framework-agnostic logic used across all integrations.

Responsibilities include:

- Verifying signed session cookies
- Authenticated server-to-server requests
- Resolving the current authenticated user
- Proxy-safe OAuth login helpers that never store provider access tokens
- Shared types and helpers

The core package does **not** depend on any specific web framework.

It is intended to be reused by:

- Node.js frameworks
- Server-side rendering environments
- Edge runtimes
- Future non-JavaScript adapters

Location:

```
packages/core
```

---

### @seamless-auth/express

The Express adapter provides middleware for integrating Seamless Auth into Express applications.

It builds on the core package and adds:

- `requireAuth` middleware for session authentication
- `requireRole` middleware for role-based authorization
- scoped-role helpers such as `hasScopedRole`
- A normalized `req.user` contract for downstream handlers

The Express adapter intentionally keeps authentication and authorization concerns separate from business logic.

It is also the natural initializer boundary for adopter-supplied auth messaging configuration such as:

- email transports
- SMS transports
- custom auth-message handlers
- optional auth template overrides

For WebAuthn PRF flows, the adapter proxies PRF registration query flags and assertion request bodies to the Seamless Auth API. PRF outputs remain browser-only and are never handled by the server adapter.

For OAuth flows, the adapter proxies provider discovery, OAuth start, and OAuth callback completion. The callback exchanges the provider authorization code at the private Seamless Auth API, then the adapter sets the normal signed access and refresh cookies for the application.

Auth-message delivery payloads are treated as sensitive. When adopter-supplied messaging is
configured, the adapter requests those payloads using its short-lived service token, sends through the
configured transport or handler, and strips the raw OTP/link details before responding to the browser.

Location:

```
packages/express
```

Example usage:

```ts
app.get(
  "/api/beta_users",
  requireAuth({ cookieSecret: process.env.COOKIE_SIGNING_KEY! }),
  requireRole("betaUser"),
  handler,
);
```

`requireRole` accepts plain roles and scoped role names. A legacy broad role such as `admin`
grants `admin:read` and `admin:write`; `admin:write` grants `admin:read`; `admin:read` does not
grant write access or satisfy a plain `admin` check.

---

## OAuth Login

OAuth support is intentionally split across the same trust boundary as the rest of Seamless Auth:

- the browser asks your app/API for enabled providers
- your server adapter proxies OAuth requests to the private Seamless Auth API
- Seamless Auth validates signed state, exchanges the provider code, links the provider identity, and issues a SeamlessAuth session
- the adapter stores only the resulting SeamlessAuth cookies

Provider access tokens are not stored by the adapter, returned to the frontend, or placed in cookies.
The adapter also does not handle provider client secrets; those remain on the Seamless Auth API host.

Mounted Express routes include:

- `GET /auth/oauth/providers`
- `POST /auth/oauth/:providerId/start`
- `POST /auth/oauth/:providerId/callback`

Example frontend sequence:

```ts
const start = await fetch("/auth/oauth/google/start", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    redirectUri: `${window.location.origin}/oauth/callback`,
    returnTo: `${window.location.origin}/dashboard`,
  }),
}).then((response) => response.json());

window.location.assign(start.authorizationUrl);
```

After the provider redirects back:

```ts
const params = new URLSearchParams(window.location.search);

await fetch("/auth/oauth/google/callback", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    code: params.get("code"),
    state: params.get("state"),
  }),
});
```

Configure providers on the Seamless Auth API using `oauth_providers` and `LOGIN_METHODS=...,oauth`.
Each provider references its client secret by environment variable name, for example
`clientSecretEnv: "GOOGLE_CLIENT_SECRET"`.

## Admin Hardening Routes

The Express adapter exposes the v1 admin recovery and session hygiene routes under the mounted auth
path:

- `DELETE /auth/admin/sessions/by-id/:id`
- `DELETE /auth/admin/sessions/:userId/revoke-all`
- `POST /auth/admin/users/:userId/recovery/device-replacement`

The device-replacement route is enforced by the Seamless Auth API and requires a fresh step-up
session before sessions, passkeys, or TOTP credentials are reset.

---

## Extensibility

Framework integrations are designed as thin adapters over the core package.

Future adapters are expected to follow the same pattern:

- Delegate cryptography and verification to `@seamless-auth/core`
- Populate a framework-native request context with a normalized user object
- Expose composable authentication and authorization primitives

Planned and likely future integrations include:

- Fastify
- NestJS
- Python (ASGI / FastAPI)
- Other server runtimes where cookie-based sessions are appropriate

Adding a new adapter does not require changes to the core authentication model.

---

## Versioning and Releases

This repository uses pnpm workspaces and Changesets for package releases.

- Local package dependencies use `workspace:^`, so adapters can test against
  unpublished core changes without waiting for core to land on npm first.

- Every adopter-facing change should include a changeset:

  ```sh
  pnpm changeset
  ```

- **Alpha releases**
  Manually published from the `Prerelease` workflow under the `alpha` npm
  dist-tag.

- **Beta releases**
  Automatically published from the `dev` branch under the `beta` npm dist-tag
  as snapshot builds.

- **RC releases**
  Automatically published from `release/**` branches under the `rc` npm
  dist-tag as snapshot builds.

- **Stable releases**
  Published from `main`. Changesets opens a version PR, then publishes npm
  packages, Git tags, changelogs, and GitHub Releases when that PR is merged.

The core and official JavaScript adapters are linked while the API is pre-1.0
so adopters can treat releases as a known-good set. See `RELEASES.md` for the
release policy.

---

## Documentation

Full documentation for Seamless Auth is available at:

[https://docs.seamlessauth.com](https://docs.seamlessauth.com)

The documentation covers:

- Architecture and authentication flow
- Session and cookie handling
- Role-based authorization
- Framework-specific integration guides
- Deployment considerations

---

## Repository Structure

```
.
├─ package.json     # Workspace scripts and release tooling
├─ pnpm-workspace.yaml
├─ RELEASES.md
├─ packages/
│  ├─ core/        # Framework-agnostic authentication logic
│  └─ express/     # Express middleware adapter
├─ .changeset/     # Release intent and Changesets config
├─ .github/
│  └─ workflows/   # CI and release pipelines
└─ README.md
```

---

## License

This repository is licensed under the AGPL-3.0 license.

Individual packages may include additional notices or licenses where appropriate.
Refer to each package directory for details.
