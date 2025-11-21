# @seamless-auth/server-express

### Seamless Auth Express Adapter

A secure, passwordless **server-side adapter** that connects your Express API to a private Seamless Auth Server.

It proxies all authentication flows, manages signed cookies, and gives you out-of-the-box middleware for verifying users and enforcing roles.

> **npm:** https://www.npmjs.com/package/@seamless-auth/express  
> **Docs:** https://docs.seamlessauth.com  
> **Repo:** https://github.com/fells-code/seamless-auth-server

> Couple with https://github.com/fells-code/seamless-auth/react for an end to end seamless experience

> Or get a full starter application with https://github.com/fells-code/create-seamless

---

---

## Installation

```bash
npm install @seamless-auth/server-express
# or
yarn add @seamless-auth/server-express
```

## Quick Example

```ts
import express from "express";
import cookieParser from "cookie-parser";
import createSeamlessAuthServer, {
  requireAuth,
  requireRole,
} from "@seamless-auth/server-express";

const app = express();
app.use(cookieParser());

// Public Seamless Auth endpoints
app.use(
  "/auth",
  createSeamlessAuthServer({ authServerUrl: process.env.AUTH_SERVER_URL! })
);

// Everything after this line requires authentication
app.use(requireAuth());

app.get("/api/me", (req, res) => res.json({ user: (req as any).user }));
app.get("/admin", requireRole("admin"), (req, res) =>
  res.json({ message: "Welcome admin!" })
);

app.listen(5000, () => console.log("Portal API running on :5000"));
```

---

# Full Documentation

## Overview

`@seamless-auth/express` lets your backend API act as an authentication and authorization server using Seamless Auth.

It transparently proxies and validates authentication flows so your frontend can use a single API endpoint for:

- Login / Registration / Logout
- User introspection (`/auth/me`)
- Session cookies (signed JWTs)
- Role & permission guards
- Internal Auth Server communication (JWKS + service tokens)

Everything happens securely between your API and a private Seamless Auth Server.

---

## Architecture

```
[Frontend App]
     │
     ▼
[Your Express API]
   ├─ createSeamlessAuthServer()  ← mounts /auth routes
   ├─ requireAuth()               ← verifies signed cookie JWT
   ├─ requireRole('admin')        ← role-based guard
   └─ getSeamlessUser()           ← calls Auth Server
     │
     ▼
[Private Seamless Auth Server]
```

---

## Environment Variables

| Variable                      | Description                            | Example                   |
| ----------------------------- | -------------------------------------- | ------------------------- |
| `AUTH_SERVER_URL`             | Base URL of your Seamless Auth Server  | `https://auth.client.com` |
| `SEAMLESS_COOKIE_SIGNING_KEY` | Secret key for signing JWT cookies     | `base64:...`              |
| `SEAMLESS_SERVICE_TOKEN`      | Private key for API → Auth Server JWTs | RSA PEM                   |
| `SERVICE_JWT_KEYID`           | Key ID for JWKS                        | `service-main`            |
| `COOKIE_DOMAIN`               | Domain for cookies                     | `.client.com`             |

---

## API Reference

### `createSeamlessAuthServer(options)`

Mounts an Express router exposing the full Seamless Auth flow:

- `/auth/login/start`
- `/auth/login/finish`
- `/auth/webauthn/...`
- `/auth/registration/...`
- `/auth/me`
- `/auth/logout`

**Options**

```ts
{
  authServerUrl: string;        // required
  cookieDomain?: string;
  cookieNameOverrides?: {
    preauth?: string;
    registration?: string;
    access?: string;
  };
}
```

---

### `requireAuth(cookieName?: string)`

Middleware that validates the signed access cookie (`seamless_auth_access` by default)  
and attaches the decoded user payload to `req.user`.

```ts
app.get("/api/profile", requireAuth(), (req, res) => {
  res.json({ user: req.user });
});
```

---

### `requireRole(role: string, cookieName?: string)`

Role-based authorization guard.  
Blocks non-matching roles with HTTP 403.

```ts
app.get("/admin", requireRole("admin"), (req, res) => {
  res.json({ message: "Welcome admin!" });
});
```

---

### `getSeamlessUser(req, authServerUrl, cookieName?)`

Calls the Auth Server’s `/internal/session/introspect` endpoint using a signed service JWT  
and returns the Seamless user object.

```ts
const user = await getSeamlessUser(req, process.env.AUTH_SERVER_URL!);
```

User shape

```ts
{
  id: string;
  email: string;
  phone: string;
  roles: string[]
}
```

## End-to-End Flow

1. **Frontend** → `/auth/login/start`  
   → API proxies to Seamless Auth Server  
   → sets short-lived pre-auth cookie.

2. **Frontend** → `/auth/webauthn/finish`  
   → API proxies, validates, sets access cookie (`seamless_auth_access`).

3. **Subsequent API calls** → `/api/...`  
   → `requireAuth()` verifies cookie and attaches user.  
   → Role routes use `requireRole()`.

---

## Local Development

In order to develop with your Seamless Auth server instance, you will need to have:

- Created an account @ https://dashboard.seamlessauth.com
- Created a new Seamless Auth application

Example env:

```bash
AUTH_SERVER_URL=http://https://<identifier>.seamlessauth.com # Found in the portal
COOKIE_DOMAIN=localhost # Or frontend domain in prod
SEAMLESS_COOKIE_SIGNING_KEY=local-secret-key # Found in the portal
```

---

## Example Middleware Stack

```ts
const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL!;
app.use(cors({ origin: "https://localhost:5001", credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/auth", createSeamlessAuthServer({ authServerUrl: AUTH_SERVER_URL }));
app.use(requireAuth());
```

---

## Security Model

| Layer                 | Auth Mechanism                        | Signed By          |
| --------------------- | ------------------------------------- | ------------------ |
| **Frontend ↔ API**    | Signed JWT in HttpOnly cookie (HS256) | Client API         |
| **API ↔ Auth Server** | Bearer Service JWT (RS256)            | API’s private key  |
| **Auth Server**       | Validates service tokens via JWKS     | Seamless Auth JWKS |

All tokens and cookies are stateless and cryptographically verifiable.

---

## Testing

You can mock `requireAuth` and test Express routes via `supertest`.

Example:

```ts
import { requireAuth } from "@seamless-auth/server-express";
app.get("/api/test", requireAuth(), (req, res) => res.json({ ok: true }));
```

---

## Roadmap

| Feature                                      | Status      |
| -------------------------------------------- | ----------- |
| JWKS-verified response signing               | ✅          |
| OIDC discovery & SSO readiness               | planned     |
| Federation (Google / Okta)                   | future      |
| Multi-framework adapters (Next.js / Fastify) | coming soon |

---

## License

MIT © 2025 Fells Code LLC  
Part of the **Seamless Auth** ecosystem.
