---
"@seamless-auth/core": patch
---

Take `@seamless-auth/types` 0.4.0.

That release adds a `z.infer` alias for each of the 43 exported schemas that
lacked one, so the naming convention now covers all 123. It is additive: no
existing export changed name or shape, and nothing core imports from the package
moved. Core keeps importing the same type names it always has.

Adopters who resolve `@seamless-auth/types` through core pick up the new aliases
and can name a response body without adding a direct `zod` dependency to call
`z.infer` themselves.
