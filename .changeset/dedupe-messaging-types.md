---
"@seamless-auth/express": patch
---

Take the messaging types from `@seamless-auth/core` instead of redeclaring them.

`packages/express/src/messaging.ts` was byte-identical to `packages/core/src/authMessaging.ts`, so every messaging type was declared twice and the two copies could drift without anything failing. The express copy is deleted and the re-exports now point at core, matching the pattern already used for `SeamlessUser`, `hasScopedRole`, and `roleGrantsAccess`.

No public surface change. `@seamless-auth/express` exports the same type names from its package root, and the deleted module was never reachable on its own because the package declares only a root export. The types the adapter and the core now share are one declaration rather than two structurally identical ones.
