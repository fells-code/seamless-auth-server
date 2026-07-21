---
"@seamless-auth/express": minor
---

Add a router-level CSRF guard that rejects cross-site state-changing requests when the adapter issues `SameSite=None` cookies.

The guard enforces `Sec-Fetch-Site` by default with no configuration: a non-safe request (anything other than GET, HEAD, or OPTIONS) is rejected with 403 when `Sec-Fetch-Site` is `cross-site`. Page JavaScript cannot forge that header and same-origin SPA calls send `same-origin` or `same-site`, so legitimate traffic passes untouched. When `Sec-Fetch-Site` is absent (older browsers), the request `Origin` is matched against the new opt-in `allowedOrigins` option; if `allowedOrigins` is unset the request passes, so nobody regresses. Server-to-server callers that send neither header pass, and a literal `null` origin is treated as cross-site. The guard only activates when the effective `sameSite` is `none`.
