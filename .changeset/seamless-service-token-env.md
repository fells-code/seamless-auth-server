---
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

The README examples read the service secret from `SEAMLESS_SERVICE_TOKEN` instead of `SERVICE_SECRET`. The auth server still reads `API_SERVICE_TOKEN`; both hold the same value. The adapters read no environment variables, so nothing changes at runtime.
