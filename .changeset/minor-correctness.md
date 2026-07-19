---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Fix assorted correctness bugs:

- Magic link polling no longer returns a body with its 204 response. Express strips bodies on 204, so the message was never delivered. The 204 status is unchanged.
- `getSeamlessUser` no longer throws when the auth server returns a 200 with an empty body. It resolves to null instead.
- `/internal/auth-events/grouped` now forwards query params to the auth server, matching the summary and timeseries routes. Grouping and filter params were previously ignored.
- The bootstrap admin invite handler now surfaces string-shaped upstream errors instead of falling back to `bootstrap_failed`, and no longer throws when the request has no parsed body.
