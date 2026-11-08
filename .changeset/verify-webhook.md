---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Verify Seamless webhooks. `@seamless-auth/core/webhook` adds `verifyWebhook`, which checks a Standard Webhooks `v1` signature against the raw body with a constant-time comparison, a 300 second timestamp tolerance in both directions and up to two secrets while one rotates, then returns the event typed with `WebhookEventSchema`. A refused webhook throws `WebhookVerificationError` with a `reason`. The adapters wrap it on their own `/webhook` subpath: `requireWebhook` middleware for Express, the `seamlessWebhook` plugin for Fastify, and `createWebhookHandler` and `verifyWebhookRequest` for Next.js. Core and the Next.js adapter now depend on `@seamless-auth/types` 0.39.0.
