---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

`EmailMessage` carries an optional `headers` record, taken from `@seamless-auth/types` 0.34.0, so an override or a custom transport can send headers such as `List-Unsubscribe` and `List-Unsubscribe-Post`. Core passes an override's headers to the email transport untouched; `@seamless-auth/messaging-aws` sends them through SES v2 and validates the names and values.

`SendEnrollmentInviteEmailInput` now comes from `@seamless-auth/types` rather than being declared in core, and the Express, Fastify and Next.js adapters export it alongside the other messaging types.
