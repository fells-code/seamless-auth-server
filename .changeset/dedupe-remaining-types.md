---
"@seamless-auth/core": patch
---

Take the remaining duplicated types from `@seamless-auth/types`.

`SeamlessUser` is now an alias of the types package's `MeUser`, and the eight messaging wire shapes (`MessagingChannel`, `DeliveryResult`, `EmailMessage`, `SmsMessage`, `SendOtpEmailInput`, `SendOtpSmsInput`, `SendMagicLinkEmailInput`, `AuthDeliveryInstruction`) are re-exported rather than declared again. Each was field for field identical to a definition that already existed upstream, which is the drift `@seamless-auth/types` exists to prevent.

What stays declared here is what genuinely belongs to this package: the transport interfaces, which carry provider implementations, and the adopter-facing configuration (`EmailTransport`, `SmsTransport`, `AuthMessageOverrideContext`, `AuthMessageOverrides`, `AuthMessagingHandlers`, `SeamlessAuthMessagingOptions`).

No public API change and no runtime cost. Every name is still exported from `@seamless-auth/core` and both adapters, the re-exports are type-only so they are erased at compile time, and the built output still imports only `@seamless-auth/types/role/matching` at runtime, so neither `zod` nor the schema barrel enters the module graph.

Closes #133.
