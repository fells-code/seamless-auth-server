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

> **npm:** https://www.npmjs.com/package/@seamless-auth/express  
> **Docs:** https://docs.seamlessauth.com  
> **Repo:** https://github.com/fells-code/seamless-auth-server

Pair this with:

- **React SDK:** https://github.com/fells-code/seamless-auth-react
- **Starter app:** https://github.com/fells-code/create-seamless

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

- `/auth/login/start`
- `/auth/login/finish`
- `/auth/webauthn/*`
- `/auth/registration/*`
- `/auth/users/me`
- `/auth/logout`

**Options**

```ts
{
  authServerUrl: string;   // required
  cookieDomain?: string;  // optional (defaults to host)
  accessCookieName?: string;
  registrationCookieName?: string;
  refreshCookieName?: string;
  preAuthCookieName?: string;
}
```

---

### `requireAuth(options?)`

Express middleware that verifies a signed access cookie and attaches the decoded user payload to `req.user`.

```ts
app.get("/api/profile", requireAuth(), (req, res) => {
  res.json({ user: req.user });
});
```

---

### `requireRole(role: string)`

Role-based authorization middleware.

Blocks requests when the authenticated user does not have the required role.

```ts
app.get("/admin", requireRole("admin"), (req, res) => {
  res.json({ message: "Welcome admin!" });
});
```

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

1. **Frontend** → `/auth/login/start`  
   API proxies request and sets a short-lived _pre-auth_ cookie.

2. **Frontend** → `/auth/webauthn/finish`  
   API verifies response and sets a signed access cookie.

3. **API routes** → `/api/*`  
   `requireAuth()` verifies the cookie and attaches `req.user`.

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
