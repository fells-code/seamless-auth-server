---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
---

Accept the session cookie on application routes outside the Fastify plugin (#207).

The Fastify plugin registers `@fastify/cookie` inside its own encapsulated scope, so a route the application registers elsewhere had no `request.cookies`. `requireAuth` answered 401 to every cookie session there, although the README presents it for exactly those routes, and `getSeamlessUser` found no session either. Both now read the `Cookie` header themselves when no cookie plugin parsed it.

`getSeamlessUser` in core also sends the access token from the verified cookie when the caller supplies no `authorization`. Before, a cookie session read outside the adapter's own routes, with no guard in front to load the cookie payload, reached the auth API with no token. This applies to the Express adapter as well.
