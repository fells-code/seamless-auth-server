---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
---

Expose TOTP routes through the adapter. `@seamless-auth/express` now mounts
`GET /auth/totp/status`, `POST /auth/totp/enroll/start`,
`POST /auth/totp/enroll/verify`, `POST /auth/totp/disable`, and
`POST /auth/totp/verify-mfa`, proxying the caller's access session upstream like
the step-up routes. This lets frontends drive TOTP enrollment, management, and
TOTP-based step-up verification, which previously had no adapter surface.

`@seamless-auth/core` adds the matching access-cookie requirements for those
paths and now matches cookie requirements case-insensitively. Express route
matching is case-insensitive by default, so a client path whose casing differed
from the mounted route (for example `/webauthn/...` vs `/webAuthn/...`)
previously failed the case-sensitive requirement lookup, silently skipped cookie
loading, and broke the request downstream. The lookup is now normalized.

TOTP as a login second factor is intentionally not included: the auth API does
not currently gate login on TOTP, so `/totp/verify-login` has no trigger yet.
