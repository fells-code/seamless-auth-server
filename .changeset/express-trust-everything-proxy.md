---
"@seamless-auth/express": patch
---

Stop forwarding a client-chosen IP when Express `trust proxy` trusts every address in a form other than `true` (#257). The adapter used to refuse only `trust proxy === true`, so a setting such as `"0.0.0.0/1, 128.0.0.0/1"` or a function that always returns `true` let a caller pick the `x-seamless-client-ip` the auth API uses for per-IP rate limits and audit records. The adapter now asks the compiled trust function about documentation addresses, as the Fastify adapter does, and in that case logs a warning and forwards no client IP. A hop count or a named proxy address or subnet forwards as before.
