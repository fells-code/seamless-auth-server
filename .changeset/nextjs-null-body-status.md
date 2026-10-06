---
'@seamless-auth/nextjs': patch
---

Send no body on a 204, 205, or 304. The auth API answers a successful passkey enrollment (`/webAuthn/register/finish`) with 204, and the handler attached its usual `{ message: "success" }`. Express and Fastify drop a body on those statuses; the `Response` constructor throws, so passkey enrollment failed with a 500.
