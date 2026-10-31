---
"@seamless-auth/core": patch
---

The bundled adapter manifest now carries the OpenID Provider admin routes (`/admin/applications` and `/admin/resources`), so the admin console reaches them through every adapter even when the live manifest cannot be fetched. Express, Fastify and Next.js serve them from the manifest with no hand registration, and parity tests hold the three adapters together on path, method, body, access token and step-up refusals.
