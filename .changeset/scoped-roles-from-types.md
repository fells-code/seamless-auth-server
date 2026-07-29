---
"@seamless-auth/core": patch
---

Take the scoped-role matching from `@seamless-auth/types` instead of maintaining a second copy.

`packages/core/src/scopedRoles.ts` reimplemented the same logic as the auth API's `src/lib/scopedRoles.ts`. They agreed, but nothing kept them in step, and they are the two places that decide whether a request is authorized. A divergence there means the API and an adopter's server disagree about who can do what. Both sides now take `roleGrantsAccess` and `hasScopedRole` from `@seamless-auth/types`, so there is one definition.

No public API change. `@seamless-auth/core` exports the same two names, and `@seamless-auth/express` already re-exported them from core. Behavior is unchanged: the replacement was checked against the deleted implementation over every granted/required pair built from a 594-string role corpus (352,836 pairs), including wildcard grants, unscoped grants, write-implies-read, empty and whitespace-padded roles, and non-array or non-string `grantedRoles`, with no differences.

Core imports the `@seamless-auth/types/role/matching` entry point, which carries the matching helpers with no dependencies of its own, so this adds nothing to what an adopter loads at runtime: `zod` stays out of the module graph and cold `import` of `@seamless-auth/core` is unchanged.
