---
"@seamless-auth/core": minor
---

Export the remaining handlers and verifiers from the package root.

The admin, session, internal-metrics, and system-config handlers, along with `verifySignedAuthResponse` and `verifyRefreshCookie`, were reachable only through a subpath import. Everything else came from the root, so which import an adapter needed depended on which handler it wanted. 27 names are now available from `@seamless-auth/core` as well.

Purely additive. Nothing is removed or renamed, the `./handlers/*` subpaths keep working, and a test asserts that a subpath import and a root import resolve to the same function rather than two copies.

The README's public API overview is rewritten to match, grouped by what an adapter author is looking for, and now covers the response contract, proxy, delivery, and contract-value exports added earlier in this epic that it had never listed.

Part of #72.
