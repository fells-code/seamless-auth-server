---
"@seamless-auth/express": patch
---

Stop rewriting client errors to 500 in the router error middleware. `express.json()` is mounted on the same router, so body-parser failures land in the catch-all. Those errors carry their own status (400 for `entity.parse.failed`, 413 for `entity.too.large`), and the middleware discarded it: a malformed JSON body answered `500 {"error":"internal_error"}` instead of 400. The middleware now honors a 4xx status from `status` or `statusCode` and answers with a generic body (`bad_request`, or `payload_too_large` for 413). Genuine 5xx failures are unchanged and still answer `500 {"error":"internal_error"}`.

Client errors are also no longer written to `console.error`. Every malformed request produced an error-level log line, so an unauthenticated caller could generate unbounded error log volume. Only 5xx failures log now.

The error object is still never serialized to the client. That matters here because `entity.parse.failed` errors carry a `body` property holding the raw payload, so echoing the parser error would reflect request content back.
