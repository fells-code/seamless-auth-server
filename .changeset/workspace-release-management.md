---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Move package development and release management to a pnpm workspace backed by
Changesets. The Express adapter now resolves core through a local workspace link
in development while publishing a normal semver dependency for adopters.
