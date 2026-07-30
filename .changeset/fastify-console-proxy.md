---
"@seamless-auth/fastify": minor
---

Serve the Seamless admin console from a Fastify API, matching the Express adapter's `createSeamlessConsoleProxy`.

`seamlessConsoleProxy` is a plugin you register under a prefix, the same shape as `seamlessAuth`, so the mount path comes from Fastify rather than from the options. The Express adapter mounts a router and takes its upstream subtree from `basePath`; here `basePath` only says what to request upstream, and it still defaults to `/console`.

It proxies `GET` and `HEAD` with `fetch`, forwards nothing from the incoming request but the method and the path, and copies back `content-type`, `cache-control`, `etag`, and `last-modified`. Unknown paths under the prefix go upstream too, which is how deep links into the dashboard get the SPA shell. A path that resolves outside the console subtree, or that carries an encoded path separator, is refused with a 400 and never reaches the upstream.

The two adapters resolve the upstream URL from the raw request path for the same reason but by different routes: Express normalizes dot-segments before routing, and Fastify percent-decodes wildcard params, so this reads `request.url` instead of `request.params` to keep the traversal check looking at what the client actually sent.

The parity suite now runs the console proxy through both adapters and asserts the status, body, caching headers, and upstream URL match.

New exports: `seamlessConsoleProxy`, `SeamlessConsoleProxyOptions`.
