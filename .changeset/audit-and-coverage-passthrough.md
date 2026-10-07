---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Pass the auth API's audit and reporting routes through with the caller's access identity: `GET /admin/auth-events/integrity` (fells-code/seamless-auth-api#174), `GET /admin/auth-events/export` (fells-code/seamless-auth-api#173) and `GET /admin/reports/authentication-coverage` (fells-code/seamless-auth-api#178), each with its query.

The export and the coverage report answer with a file (NDJSON, or CSV when `format=csv`), so proxied routes can now forward an upstream response unparsed. `proxyRequest` takes `raw: true` and returns `raw: { headers, body }`, holding the body stream and its `content-type`, `content-disposition` and `cache-control`. Each adapter streams it through as is, so the download keeps its type and filename rather than arriving wrapped in `{ message }`.

`ResponseAdapter` gains a required `sendRaw(status, raw)`. A custom adapter that implements `ResponseAdapter` itself has to add it. The adapters in this repository already do.

`@seamless-auth/types` is now `^0.27.0`.
