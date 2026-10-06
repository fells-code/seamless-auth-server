---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Pass `GET /admin/enrollment` (with its query) and `POST /admin/enrollment/invites` through to the auth API with the caller's access identity. They report passkey enrollment progress and send enrollment invites (fells-code/seamless-auth-api#338).
