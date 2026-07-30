---
"@seamless-auth/core": minor
"@seamless-auth/express": patch
---

Move the passthrough proxy into `@seamless-auth/core`, and fix repeated query parameters being joined.

The 33 organizations, step-up, TOTP, users, and admin passthrough routes existed only inside the Express adapter, with no core equivalent, so a new adapter would have had to rebuild both the upstream call and the session gate that guards it. New exports:

- `proxyRequest({ authServerUrl, path, method, authorization, serviceAuthorization, forwardedClientIp, query, body })` forwards a request and returns the upstream status and body unchanged.
- `checkProxyIdentity({ subject, cookies, identity, ...cookieNames })` is the pure session gate, returning the rejection to send or `undefined` to proceed.
- `buildQueryString` and `buildUpstreamUrl` replace three separate querystring builders that had drifted apart.

**Fix:** a repeated query parameter reached the auth API joined into a single comma-separated value on the admin and internal-metrics routes. `GET /admin/auth-events?type=login&type=logout` was forwarded as `type=login,logout`, and the API's `AuthEventQuerySchema` accepts `type` as an array, so the joined value matched no event type and the filter silently returned the wrong set. Array parameters are now forwarded as repeated parameters on every route. Nested objects are dropped rather than stringified, so a query like `?filter[from]=x` can no longer reach the API as `filter=[object Object]`.

The Express adapter drops 38 lines, `createServer.ts` drops from 705 to 667 lines, and the proxy handler is now a gate check, a call, and a response.
