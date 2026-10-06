---
'@seamless-auth/core': patch
'@seamless-auth/express': patch
'@seamless-auth/fastify': patch
'@seamless-auth/nextjs': patch
---

Support Node 22 and newer. The `engines` field now requires `>=22` instead of `>=24 <25`, and CI runs on Node 22, 24, and the latest release (fells-code/seamless-auth-api#339).
