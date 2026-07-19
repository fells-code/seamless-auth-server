# @seamless-auth/express

[![npm version](https://img.shields.io/npm/v/@seamless-auth/express.svg)](https://www.npmjs.com/package/@seamless-auth/express)
[![test coverage](https://img.shields.io/badge/coverage-coming%20soon-lightgrey)](#testing)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](#license)

### Seamless Auth – Express Adapter

A secure, passwordless **server-side adapter** for Express that connects your API to a private **Seamless Auth Server**.

This package:

- Proxies authentication flows
- Manages signed, HttpOnly session cookies
- Enforces authentication and authorization in your API
- Handles all API ↔ Auth Server communication via short-lived service tokens
- Proxies optional OAuth login flows and converts successful callbacks into app cookies
- Establishes the initializer surface for adopter-supplied auth messaging

> **npm:** https://www.npmjs.com/package/@seamless-auth/express  
> **Docs:** https://docs.seamlessauth.com  
> **Repo:** https://github.com/fells-code/seamless-auth-server

Pair this with:

- **React SDK:** https://github.com/fells-code/seamless-auth-react
- **Starter app:** https://github.com/fells-code/seamless-cli

---

## Installation

```bash
npm install @seamless-auth/express
# or
yarn add @seamless-auth/express
```

---

## Quick Start

```ts
import express from "express";
import cookieParser from "cookie-parser";
import {
  createSeamlessAuthServer,
  createSeamlessConsoleProxy,
  requireAuth,
  requireRole,
} from "@seamless-auth/express";

const app = express();
app.use(express.json());
app.use(cookieParser());

// Mount Seamless Auth routes
app.use(
  "/auth",
  createSeamlessAuthServer({
    authServerUrl: process.env.AUTH_SERVER_URL!,
  }),
);

// Serve the Seamless admin dashboard on the same origin as /auth
app.use(
  "/console",
  createSeamlessConsoleProxy({
    authServerUrl: process.env.AUTH_SERVER_URL!,
  }),
);

// Everything below requires authentication
app.use(requireAuth());

app.get("/api/me", (req, res) => {
  res.json({ user: req.user });
});

app.get("/admin", requireRole("admin"), (req, res) => {
  res.json({ message: "Welcome admin!" });
});

app.listen(5000, () => console.log("API running on http://localhost:3000"));
```

---

## Overview

`@seamless-auth/express` lets your backend API act as the **security boundary** for authentication and authorization.

Your API:

- owns user session cookies
- verifies identity locally
- asserts identity upstream using service tokens
- never forwards browser cookies to the Auth Server

This keeps trust boundaries clean and auditable.

---

## Architecture

```
[Frontend App]
     │
     ▼
[Your Express API]
   ├─ createSeamlessAuthServer()  ← mounts /auth routes
   ├─ requireAuth()               ← verifies access cookie
   ├─ requireRole("admin")        ← role-based guard
   └─ getSeamlessUser()           ← optional user hydration
     │
     ▼
[Private Seamless Auth Server]
```

---

## Environment Variables

| Variable             | Description                               | Example                   |
| -------------------- | ----------------------------------------- | ------------------------- |
| `AUTH_SERVER_URL`    | Base URL of your Seamless Auth Server     | `https://auth.client.com` |
| `COOKIE_SIGNING_KEY` | Secret for signing API session cookies    | `local-dev-secret`        |
| `API_SERVICE_TOKEN`  | API → Auth Server service secret          | `shared-m2m-value`        |
| `APP_ORIGIN`         | Your site URL (or localhost in demo mode) | `https://myapp.com`       |
| `DB_HOST`            | Database Host                             | `localhost`               |
| `DB_PORT`            | Database Port                             | `5432`                    |
| `DB_USER`            | Database user                             | `myuser`                  |
| `DB_PASSWORD`        | Database password                         | `mypassword`              |
| `DB_NAME`            | Name of your database                     | `seamless`                |

---

## API Reference

### `createSeamlessAuthServer(options)`

Mounts an Express router that exposes the full Seamless Auth flow under `/auth`.

Routes include:

- `/auth/login`
- `/auth/oauth/providers`
- `/auth/oauth/:providerId/start`
- `/auth/oauth/:providerId/callback`
- `/auth/webauthn/*`
- `/auth/step-up/*`
- `/auth/totp/*` (enrollment, disable, status, and `verify-mfa` step-up)
- `/auth/registration/*`
- `/auth/users/me`
- `DELETE /auth/logout` for the current session
- `DELETE /auth/logout/all` for every session owned by the current user
- `GET /auth/logout` as a deprecated all-session compatibility route

**Options**

```ts
{
  authServerUrl: string;   // required
  cookieDomain?: string;  // optional (defaults to host)
  cookieSecure?: boolean;  // optional (defaults to true)
  cookieSameSite?: "lax" | "none" | "strict";  // optional
  accessCookieName?: string;
  registrationCookieName?: string;
  refreshCookieName?: string;
  preAuthCookieName?: string;
  messaging?: {
    email?: EmailTransport;
    sms?: SmsTransport;
    handlers?: Partial<AuthMessagingHandlers>;
    overrides?: AuthMessageOverrides;
  };
}
```

#### Secret strength

`cookieSecret` and `serviceSecret` are validated at startup. Each must be at least 32 characters,
otherwise `createSeamlessAuthServer` (and `createEnsureCookiesMiddleware`) throws before the router
is mounted. A short secret can be brute forced offline, which would let an attacker forge cookie
sessions and service tokens.

The same check applies to `requireAuth({ cookieSecret })`, which throws when the guard is
constructed, and to `getSeamlessUser`, which validates through `@seamless-auth/core`.

Generate secrets with a CSPRNG, for example `openssl rand -base64 48`, and supply them through the
environment rather than source.

#### JWKS key id

`jwksKid` is optional and still falls back to `dev-main`. When it is omitted or set to `dev-main`,
the adapter logs a startup warning, because a dev-flavored key id in a deployed environment usually
means the value was never configured. Set `jwksKid` to the active JWKS key id in production.

#### Cookie security

Auth cookies are issued with `Secure` and `SameSite=None` by default, so a deployment that
forgets to set an environment variable still gets safe cookies. Cookie security is driven by
explicit options, never by ambient `NODE_ENV`.

- `cookieSecure` defaults to `true`. Set it to `false` only when serving the adapter over plain
  HTTP on a local development machine.
- `cookieSameSite` defaults to `none` when `cookieSecure` is `true`, and `lax` when it is `false`.
  Browsers reject `SameSite=None` without `Secure`, so the default pairing stays valid either way.

```ts
app.use(
  "/auth",
  createSeamlessAuthServer({
    authServerUrl: "https://identifier.seamlessauth.com",
    cookieSecret: process.env.COOKIE_SECRET,
    serviceSecret: process.env.SERVICE_SECRET,
    issuer: "https://api.mycompany.com",
    audience: "https://identifier.seamlessauth.com",
    // local HTTP dev only, never in a deployed environment
    cookieSecure: false,
  }),
);
```

`messaging` is the initializer-facing contract for adopter-supplied auth messaging capabilities.

When `messaging` is provided, `@seamless-auth/express` requests external-delivery payloads from the upstream auth server for auth-message flows and completes delivery locally through the configured transports or handlers. These payloads contain OTPs or one-time links and are stripped before the adapter responds to the browser.

This currently applies to:

- OTP email
- OTP SMS
- magic-link email
- bootstrap invite email

---

### `createSeamlessConsoleProxy(options)`

Mounts an Express router that reverse-proxies the Seamless admin dashboard SPA. Mount it at
top-level `/console`, as a sibling of the `/auth` mount, so the dashboard loads from the same
origin that exposes this adapter's cookie-based `/auth/*` endpoints:

```ts
app.use("/auth", createSeamlessAuthServer(opts));
app.use(
  "/console",
  createSeamlessConsoleProxy({ authServerUrl: opts.authServerUrl }),
);
```

The dashboard is built same-origin (base path `/console`, React Router basename `/console`) and
still speaks the adapter contract: it calls `<origin>/auth<path>` with `credentials: "include"`.
It must therefore be served from the origin that exposes this adapter, which this proxy provides
by forwarding `/console` to the auth API's `/console`.

**Requirements**

- Use the same-origin `/console` dashboard build, not the bare auth API build.
- The auth API (`seamless-auth-api`) must have `SERVE_ADMIN_DASHBOARD` enabled (its default) so it
  serves the SPA at `/console`. When disabled upstream, the proxy forwards the upstream `404`.

**Behavior**

- Reverse-proxies `GET` and `HEAD` requests for the mounted subtree to
  `${authServerUrl}${basePath}${subpath}`, forwarding the upstream status and copying
  `content-type`, `cache-control`, `etag`, and `last-modified`. SPA history fallback and cache
  headers are the auth API's responsibility, so the proxy forwards whatever the upstream returns,
  including its `404`s.
- Rejects requests that would escape the console subtree (such as `/console/../admin/users`) with
  a `400` so they never reach the auth API's admin routes.
- Never forwards the incoming `Cookie` or `Authorization` header upstream; static assets need
  neither, and this avoids leaking the adapter session.
- Other HTTP methods receive `405`, and a request body is ignored.
- Returns `502` when the auth API is unreachable.

**Options**

```ts
{
  authServerUrl: string;  // required, base URL of the Seamless Auth API serving /console
  basePath?: string;      // optional, defaults to "/console"
}
```

---

### OAuth Login Routes

When OAuth is enabled in the Seamless Auth API system config, the Express adapter exposes the
provider flow under your mounted `/auth` path:

- `GET /auth/oauth/providers` returns public provider metadata such as `id`, `name`, and scopes.
- `POST /auth/oauth/:providerId/start` returns a signed `state` and provider `authorizationUrl`.
- `POST /auth/oauth/:providerId/callback` accepts the provider `code` and `state`, then sets the
  same signed access/refresh cookies as passkey, OTP, or magic-link login.

Example OAuth start from a browser:

```ts
const result = await fetch("/auth/oauth/google/start", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    redirectUri: `${window.location.origin}/oauth/callback`,
    returnTo: `${window.location.origin}/dashboard`,
  }),
}).then((response) => response.json());

window.location.assign(result.authorizationUrl);
```

Example callback page:

```ts
const params = new URLSearchParams(window.location.search);

const response = await fetch("/auth/oauth/google/callback", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    code: params.get("code"),
    state: params.get("state"),
  }),
});

if (response.ok) {
  window.location.assign("/dashboard");
}
```

Provider configuration belongs on the Seamless Auth API, not in the Express adapter. Configure
`LOGIN_METHODS` to include `oauth`, add `oauth_providers`, and store provider client secrets in
server environment variables referenced by `clientSecretEnv`.

Provider access tokens are never stored in adapter cookies or returned to the frontend.

---

### Admin Hardening Routes

When mounted under `/auth`, the adapter proxies the admin hardening endpoints used by the
Seamless Auth dashboard:

- `DELETE /auth/admin/sessions/by-id/:id`
- `DELETE /auth/admin/sessions/:userId/revoke-all`
- `POST /auth/admin/users/:userId/recovery/device-replacement`

The device-replacement endpoint requires the current admin session to have fresh step-up
authentication in the Seamless Auth API.

---

### `requireAuth(options?)`

Express middleware that verifies a signed access cookie and attaches the decoded user payload to `req.user`.

```ts
app.get("/api/profile", requireAuth(), (req, res) => {
  res.json({ user: req.user });
});
```

---

### `requireRole(role: string | string[])`

Role-based authorization middleware with scoped-role support.

Blocks requests when the authenticated user does not have the required role. Scoped roles use
colon-separated names such as `admin:read` and `admin:write`.

```ts
app.get("/admin/users", requireRole("admin:read"), (req, res) => {
  res.json({ users: [] });
});

app.post("/admin/users", requireRole("admin:write"), (req, res) => {
  res.json({ message: "User created" });
});
```

Compatibility rules:

- `admin` grants `admin:read` and `admin:write`
- `admin:write` grants `admin:read`
- `admin:read` does not grant write access or satisfy `requireRole("admin")`

---

### `getSeamlessUser(req, authServerUrl, cookieName?)`

Optional helper that calls the Auth Server to retrieve the **fully hydrated user object**.

This does **not** enforce authentication.

```ts
const user = await getSeamlessUser(req, process.env.AUTH_SERVER_URL);
```

Returned shape (example):

```ts
{
  id: string;
  email: string;
  phone: string;
  roles: string[];
}
```

---

## End-to-End Flow

1. **Frontend** → `/auth/login`
   API proxies request and sets a short-lived _pre-auth_ cookie.

2. **Frontend** → `/auth/webauthn/finish`  
   API verifies response and sets a signed access cookie.

3. **API routes** → `/api/*`  
   `requireAuth()` verifies the cookie and attaches `req.user`.

For OAuth, the initial identifier step is replaced by `/auth/oauth/:providerId/start`; the callback
completion route sets the same authenticated cookies used by the rest of the adapter.

---

## Local Development

```bash
AUTH_SERVER_URL=http://localhost:5312
SEAMLESS_SERVICE_TOKEN=generated-secret
COOKIE_SIGNING_KEY=local-dev-key
FRONTEND_URL=http://localhost:5001
```

---

## Testing

This package includes **Express smoke tests** using `supertest`.

Core authentication logic is tested separately in `@seamless-auth/core`.

---

## License

**AGPL-3.0-only** © 2026 Fells Code LLC

This license ensures:

- transparency of security-critical code
- freedom to self-host and modify
- sustainability of the managed service offering

See [`LICENSE`](./LICENSE) for details.
