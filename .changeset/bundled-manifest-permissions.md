---
"@seamless-auth/core": patch
---

Syncs the bundled adapter manifest with the auth API's `main`, adding the permission and organization role routes from API #576 and #577. A manifest fetch that fails at startup no longer hides those routes from an adapter, which made a console behind it report that it needs API v0.23.
