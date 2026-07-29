---
"@seamless-auth/core": minor
"@seamless-auth/express": patch
---

Move auth message delivery into `@seamless-auth/core`.

`deliverAuthMessage`, `applyExternalDelivery`, and `stripDelivery` lived in the Express adapter but had no framework coupling: their only imports were the messaging types, which already came from core. Every future adapter would have had to reimplement or copy them. They now sit beside the messaging contract in core and are exported from the package root, and the adapter imports them.

`applyExternalDelivery`, `deliverAuthMessage`, and `stripDelivery` are new named exports of `@seamless-auth/core`. Nothing is removed from `@seamless-auth/express`: the three helpers were internal to it and were never exported.

The warning logged when external delivery is requested but the auth API returns no delivery payload is now prefixed `[SeamlessAuth]` rather than `[SEAMLESS-AUTH-EXPRESS]`, matching the rest of core. The text is unchanged. Anything matching on that prefix in log processing needs updating.

Part of #72.
