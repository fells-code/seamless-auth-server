---
'@seamless-auth/express': minor
'@seamless-auth/fastify': minor
---

Pass `PUT` and `DELETE /admin/organizations/:organizationId/oauth-providers/:providerId/retirement` through to the auth API with the caller's access identity. They retire an OAuth provider for one organization during a migration cutover and restore it for a rollback (fells-code/seamless-auth-api#337). The Fastify proxy route table now accepts `PUT`.
