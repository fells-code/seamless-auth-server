---
"@seamless-auth/express": minor
---

Require Express 5.

BREAKING: the `express` and `@types/express` peer ranges are now `>=5.0.0`, up from `>=4.18.0` and `>=4.17.0`. Adopters still on Express 4 need to upgrade their application before taking this release.

Under Express 4 a rejected handler promise was never routed anywhere, so an upstream failure (a network error reaching the auth server, for example) left the request hanging until the client timed out. Express 5 forwards rejected handler promises to error middleware, which makes those failures terminate properly.

The router now also registers its own error middleware. The Express built-in handler answers with an HTML stack trace, including absolute server paths, whenever `NODE_ENV` is not `production`. Route errors now return `500` with a JSON `{ "error": "internal_error" }` body and are logged server side instead.
