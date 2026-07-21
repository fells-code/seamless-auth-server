---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Pre-release documentation and metadata corrections. The `requireRole` JSDoc example no longer calls `requireAuth()` with no arguments (which does not compile and throws), its malformed code fence is closed, and it now shares a constructed guard. The README Quick Start startup log matches its listen port, the `createSeamlessAuthServer` options block lists the `resolveClientIp` option, and the end-to-end flow references the real `webAuthn/login/finish` route. Both packages now declare `keywords` for npm discoverability.
