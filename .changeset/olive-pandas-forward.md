---
'@seamless-auth/core': minor
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Forward a magic link destination to the auth API.

`seamless-auth-api` now accepts an optional `redirectUri` on `GET /magic-link`,
deciding where the emailed link lands. Until now the adapters called that route with
no query, so the feature was reachable only by a backend calling the API directly. A
browser or mobile client could not use it, which was most of the point: a tenant with
both a web app and a mobile app needs each to receive a link that opens in the right
place.

`RequestMagicLinkInput` gains an optional `redirectUri`, and both adapters read it
from the request body of their own `POST /magic-link` and pass it through. Omit it and
nothing changes: the upstream URL is exactly what it was, so no adopter has to do
anything.

The adapters forward the value rather than checking it. The auth API validates it
against the configured origins and answers `400` if it is not allowed, and an
allowlist that lives in two places is one that eventually disagrees with itself. A
value that is not a string is dropped rather than coerced, so it cannot turn into a
query parameter meaning something the caller did not send.

Requires an auth API that understands the parameter. Against an older one the
parameter is ignored and the link keeps the tenant-wide destination, which is the
behaviour adopters have today.
