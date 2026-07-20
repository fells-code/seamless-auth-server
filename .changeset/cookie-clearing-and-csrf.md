---
"@seamless-auth/express": minor
---

Fix two security issues in the Express adapter.

Cookie clearing now mirrors the cookie set path. `clearSessionCookie` and
`clearAllCookies` previously emitted a clearing header with no `Secure` or
`SameSite`, which browsers reject in a cross-site response. In the default
cross-site deployment that meant logout returned 204 and revoked the session
upstream while the signed cookie survived in the browser and stayed valid for
every route guarded by `requireAuth` until its own TTL expired.

BREAKING: `GET /auth/logout` and `GET /auth/magic-link` are removed. Both were
state-changing routes reachable as simple cross-site requests, so an `<img src>`
on any page could revoke all of a user's sessions or trigger magic-link emails.
Use `DELETE /auth/logout/all` in place of `GET /auth/logout`, and the new
`POST /auth/magic-link` in place of `GET /auth/magic-link`.
