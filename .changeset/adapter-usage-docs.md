---
"@seamless-auth/express": patch
---

Correct the adapter usage docs. The README Quick Start now passes every required option (`authServerUrl`, `cookieSecret`, `serviceSecret`, `audience`) and calls `requireAuth({ cookieSecret })`, so the copy-paste example runs. The Environment Variables table, which listed variables the adapter never reads (including unrelated database settings), is replaced with a configuration section stating that all settings are passed as options. The `requireAuth` JSDoc no longer claims the guard performs token refresh or documents a positional signature it does not accept, and its duplicated options interface is removed.
