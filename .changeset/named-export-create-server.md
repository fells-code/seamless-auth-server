---
"@seamless-auth/express": patch
---

Export `createSeamlessAuthServer` by name. The symbol was imported into the package entry point and used only for the default export, so `import { createSeamlessAuthServer } from "@seamless-auth/express"` resolved to `undefined` and threw `TypeError: createSeamlessAuthServer is not a function`. That is the form used by the README Quick Start, every other README example, and the Express template scaffold, so the documented setup path did not run. The default export is unchanged and still works.

The adapter README also documented a `getSeamlessUser` signature that no longer exists. It showed `getSeamlessUser(req, authServerUrl, cookieName?)`, while the real signature takes the same options object as `createSeamlessAuthServer`. Following the documented call reached the core secret check and threw on a missing `cookieSecret`.

Both packages now carry a smoke test that imports every documented symbol by name from the built `dist`, so a named export that goes missing fails the suite instead of shipping.
