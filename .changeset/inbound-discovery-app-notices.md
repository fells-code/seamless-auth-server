---
"@seamless-auth/core": patch
"@seamless-auth/nextjs": patch
---

Serve `POST /system-config/oauth-providers/{id}/discovery` from the bundled manifest, so an adapter that cannot fetch the live manifest still reaches the auth API route that reads an OAuth provider's discovery document again. Account notice deliveries accept the `application_notice` notice from `@seamless-auth/types` 0.34, and `SendAccountNoticeEmailInput` and `SendAccountNoticeSmsInput` carry the optional `application` (`clientId` and `name`) the auth API sends with it, for a handler or override that renders its own template. `AccountNoticeApplication` is re-exported.
