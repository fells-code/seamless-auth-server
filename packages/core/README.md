# @seamless-auth/core

[![npm version](https://img.shields.io/npm/v/@seamless-auth/core.svg)](https://www.npmjs.com/package/@seamless-auth/core)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](#license "License")

### Seamless Auth – Core

`@seamless-auth/core` contains the **framework-agnostic authentication logic** that powers the Seamless Auth ecosystem.

It is designed to be:

- deterministic
- auditable
- testable
- independent of any web framework

If you are building a custom adapter (Express, Fastify, Next.js, Hono, etc.), this is the package you integrate with.

---

## What This Package Is

- Core authentication state machine
- Cookie validation and refresh logic
- Service-token–based API ↔ Auth Server communication
- Stateless, cryptographically verifiable flows

This package **does not**:

- depend on Express or any framework
- read environment variables
- set cookies or headers directly
- manage HTTP requests or responses

---

## Who Should Use This

You should use `@seamless-auth/core` if:

- You are building a backend adapter
- You want full control over your HTTP layer
- You are integrating Seamless Auth into a non-Express runtime
- You want to audit or extend authentication behavior

If you are using Express, you probably want:

```
@seamless-auth/express
```

---

## Design Principles

- **Explicit trust boundaries**  
   Browser cookies are never forwarded upstream.

- **Stateless by default**  
   All session data is encoded and signed.

- **Short-lived assertions**  
   Service tokens are minimal and ephemeral.

- **No hidden magic**  
   All inputs are explicit.

---

## Core Concepts

### Identity States

- **Unauthenticated**
- **Pre-authenticated** (OTP / WebAuthn in progress)
- **Authenticated** (access cookie issued)

Core helpers enforce transitions between these states.

---

## Public API (Overview)

Key exports include:

- `ensureCookies(...)` – validates and refreshes session cookies
- `refreshAccessToken(...)` – rotates expired access sessions
- `verifyCookieJwt(...)` – verifies signed cookie payloads
- `createServiceToken(...)` – creates short-lived M2M assertions

These functions return **descriptive results**, not HTTP responses.

---

## Example (Adapter Pseudocode)

```ts
const result = await ensureCookies(
  { path, cookies },
  {
    authServerUrl,
    cookieSecret,
    serviceSecret,
    issuer,
    audience,
    keyId,
    accessCookieName,
    refreshCookieName,
    preAuthCookieName,
  },
);

if (result.setCookies) {
  // adapter applies cookies
}

if (result.type === "error") {
  // adapter sends HTTP error
}
```

---

## Testing

All logic in this package is tested against compiled output (`dist/`),
ensuring behavior matches production runtime exactly.

---

## License

**AGPL-3.0-only** © 2026 Fells Code LLC

This license ensures:

- transparency of security-critical code
- freedom to self-host and modify
- sustainability of the managed service offering

See [`LICENSE`](./LICENSE) for details.
