# Seamless Auth Server Packages

Seamless Auth is an open source, passwordless authentication system designed to be embedded directly into applications.

It provides a small, explicit core and framework-specific adapters that make it easy to integrate secure, session-based authentication into APIs and web applications without redirects, third-party identity providers, or opaque middleware chains.

This repository contains the core building blocks and official server-side framework integrations.

---

## Philosophy

Seamless Auth is built around a few guiding principles:

- **Passwordless by default**
  Authentication is based on possession and verification, not shared secrets.

- **Embedded authentication**
  Auth flows live inside your application. No redirects, callbacks, or hosted UI.

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
- A normalized `req.user` contract for downstream handlers

The Express adapter intentionally keeps authentication and authorization concerns separate from business logic.

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

This repository uses a staged release model:

- **Beta releases**
  Automatically published from the `dev` branch under the `beta` npm dist-tag.

- **Stable releases**
  Published only when explicit version tags are created (for example `core-v1.0.0` or `express-v1.0.0`).

Each package is versioned and released independently.

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
├─ packages/
│  ├─ core/        # Framework-agnostic authentication logic
│  └─ express/     # Express middleware adapter
├─ .github/
│  └─ workflows/   # CI and release pipelines
└─ README.md
```

---

## License

This repository is licensed under the AGPL-3.0 license.

Individual packages may include additional notices or licenses where appropriate.
Refer to each package directory for details.
