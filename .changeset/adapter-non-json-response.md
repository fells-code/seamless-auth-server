---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Don't crash on non-JSON upstream responses. `authFetch` now parses response bodies
defensively, so a plain-text error (e.g. a rate-limited `429 Too many requests`) or an
empty body (`204`) no longer throws in handlers that read the body before checking the
status — which previously surfaced as an unhandled rejection that took down the adapter
process. Non-JSON bodies are returned as `{ message: <text> }`; empty bodies as
`undefined`. Fixes #41.
