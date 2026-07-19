---
"@seamless-auth/express": minor
---

Add `createSeamlessConsoleProxy` to serve the Seamless admin dashboard SPA at `/console` on the same origin as the adapter's `/auth/*` endpoints. The companion Router reverse-proxies `GET`/`HEAD` requests to the auth API's `/console`, forwards the upstream status and cache headers, guards against path traversal outside the console subtree, and never forwards the incoming session cookie or Authorization header upstream.
