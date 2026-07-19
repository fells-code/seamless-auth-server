---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Encode user-derived path segments before interpolating them into upstream auth server URLs.

Admin handlers, session handlers, and the Express `/magic-link/verify/:token` route interpolated route params directly into the upstream URL. A param carrying an encoded `?`, `#`, `;`, or `%2F` was decoded into the URL raw, so it could append or override upstream query params or reshape the upstream path.

Every user-derived segment now goes through `encodeURIComponent`, matching the organization and OAuth routes. A param that previously reshaped the upstream request is now confined to a single path segment, which upstream rejects as an unknown id.
