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
- Framework-agnostic OAuth provider discovery/start/callback helpers
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

Everything below is available from the package root. The `./handlers/*` subpaths
remain for direct imports.

**Sessions and cookies**

- `ensureCookies(...)` – validates and refreshes session cookies
- `refreshAccessToken(...)` – rotates expired access sessions
- `verifyCookieJwt(...)` – verifies signed cookie payloads
- `verifyRefreshCookie(...)` – verifies a refresh cookie, returning `null` on failure
- `verifySignedAuthResponse(...)` – verifies an auth API response signature against its JWKS
- `getSeamlessUser(...)` – resolves the hydrated user, typed as `SeamlessUser | null`
- `hasScopedRole(...)` – checks scoped role grants such as `admin:read`

**Building an adapter**

- `applyResult(result, adapter, opts)` – turns a handler result into a response
- `applyCookies(result, adapter, opts)` – cookie instructions only, for middleware
- `ResponseAdapter` – the three methods an adapter provides: `setCookie`, `clearCookie`, `send`
- `proxyRequest(...)` – forwards a request to the auth API and returns its status and body
- `checkProxyIdentity(...)` – checks a request carries the session a proxied route requires
- `buildQueryString(...)` / `buildUpstreamUrl(...)` – build an upstream URL
- `signSessionCookie(...)` / `resolveCookieSameSite(...)` – cookie format and policy
- `authFetch(...)` – calls the auth API with the adapter's headers and a tolerant `json()`

**Auth flow handlers**

`loginHandler`, `finishLoginHandler`, `registerHandler`, `finishRegisterHandler`,
`logoutHandler`, `meHandler`, `requestOtpHandler`, `verifyLoginOtpHandler`,
`verifyRegistrationOtpHandler`, `requestMagicLinkHandler`, `verifyMagicLinkHandler`,
`pollMagicLinkConfirmationHandler`, `switchOrganizationHandler`,
`listOAuthProvidersHandler`, `startOAuthLoginHandler`, `finishOAuthLoginHandler`.

**Admin and operations handlers**

User, session, auth-event, metrics, and system-config handlers, for example
`getUsersHandler`, `updateUserHandler`, `listSessionsHandler`,
`getAuthEventsHandler`, `getDashboardMetricsHandler`, and
`getAvailableRolesHandler`.

**Message delivery**

- `deliverAuthMessage(...)` – delivers an auth message through the configured transports
- `applyExternalDelivery(...)` – delivers the payload on a response body and strips it
- `stripDelivery(...)` – removes the delivery payload from a body

**Auth API contract**

- `SERVICE_TOKEN_ISSUER` / `SERVICE_TOKEN_AUDIENCE` – the fixed identity for M2M service tokens
- `AUTH_DELIVERY_MODE_HEADER` / `EXTERNAL_DELIVERY_MODE` / `EXTERNAL_DELIVERY_HEADERS`
- `DEV_JWKS_KID` – the fallback key id, which is a misconfiguration to deploy on
- `createServiceToken(...)` / `buildExternalDeliveryAuthorization(...)` – mint service tokens

**Utilities**

- `assertSecretStrength(...)` / `assertSecrets(...)` – enforce the minimum secret length
- `redactSensitiveText(...)` – masks tokens, bearer values, and secrets before logging

Handlers return **descriptive results**, not HTTP responses. `applyResult` is what
turns one into a response, and it is the only place that decides how.

### Secret strength

`cookieSecret` and `serviceSecret` must be at least 32 characters (`MIN_SECRET_LENGTH`). A shorter
secret can be brute forced offline, which would let an attacker forge cookie sessions and service
tokens.

The check runs wherever a secret enters the core as configuration: `ensureCookies`,
`refreshAccessToken`, `getSeamlessUser`, and `createServiceToken` all throw on a missing or weak
secret. `verifyCookieJwt` and `verifyRefreshCookie` are low-level primitives and keep their
"return `null` on failure" contract unchanged.

Generate secrets with a CSPRNG, for example `openssl rand -base64 48`.

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

## OAuth Helper Flow

The core OAuth helpers are designed for framework adapters. They do not redirect, set cookies, or
read secrets. They proxy to the Seamless Auth API and return plain result objects that your adapter
turns into HTTP responses.

```ts
const providers = await listOAuthProvidersHandler({
  authServerUrl: "https://auth.example.com",
});

const started = await startOAuthLoginHandler(
  {
    providerId: "google",
    body: {
      redirectUri: "https://app.example.com/oauth/callback",
      returnTo: "https://app.example.com/dashboard",
    },
  },
  { authServerUrl: "https://auth.example.com" },
);

const finished = await finishOAuthLoginHandler(
  {
    providerId: "google",
    body: {
      code: "provider-code",
      state: "signed-state-from-start",
    },
  },
  {
    authServerUrl: "https://auth.example.com",
    accessCookieName: "seamless-access",
    refreshCookieName: "seamless-refresh",
  },
);

if (finished.setCookies) {
  // adapter signs and applies access/refresh cookies
}
```

The Seamless Auth API handles state validation, provider token exchange, userinfo lookup, and
provider identity linking. Core and adapter code never store provider access tokens.

---

## Scoped Roles

Core exports `hasScopedRole` and `roleGrantsAccess` for framework adapters and custom servers that
need the same authorization semantics as `@seamless-auth/express`.

```ts
import { hasScopedRole } from "@seamless-auth/core";

hasScopedRole(["admin:write"], "admin:read"); // true
hasScopedRole(["admin:read"], "admin:write"); // false
```

Plain roles remain backwards compatible. `admin` grants `admin:read` and `admin:write`, while
`admin:read` does not satisfy a plain `admin` check.

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
