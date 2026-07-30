---
"@seamless-auth/core": minor
"@seamless-auth/express": patch
---

Move the response contract into `@seamless-auth/core`.

Turning a handler result into an HTTP response was adapter knowledge: sign each session cookie, mirror the set attributes when clearing, clear before setting, write cookies before the body, send an upstream failure body untouched but wrap a code as `{ error, details }`. The Express adapter carried it, copied across nine handlers plus the cookie middleware, and every new adapter would have had to reproduce all of it correctly.

Core now owns it. New exports:

- `applyResult(result, adapter, opts)` applies a result to a response.
- `applyCookies(result, adapter, opts)` applies only the cookie instructions, for middleware that continues the request instead of answering it.
- `ResponseAdapter`, the three things an adapter must provide: `setCookie`, `clearCookie`, and `send`.
- `signSessionCookie`, `resolveCookieSameSite`, and the `CookieSameSite`, `CookieSecurityOptions`, `SetCookieCommand`, `ClearCookieCommand`, `SessionCookie`, and `AppliableResult` types.

Cookie signing moves to core with them, because the cookie format is core's: an adapter that signed differently would mint sessions this package cannot read back.

The Express adapter drops 291 lines of source and 5.5KB of bundle, and `@seamless-auth/express` no longer carries its own cookie module. Nothing is removed from its public surface. `CookieSameSite` is now re-exported from core rather than declared locally, so `SeamlessAuthServerOptions` is unchanged for adopters.

Responses are unchanged, verified rather than assumed. Status, body, and every `Set-Cookie` header were captured on both revisions across eleven scenarios covering session set and clear, secure and insecure policy, a custom cookie domain, coded and passthrough failures, an empty failure body, and success bodies. All are byte-identical, including `HttpOnly`, `Secure`, `SameSite`, `Domain`, `Path`, and `Max-Age`.

Part of #72.
