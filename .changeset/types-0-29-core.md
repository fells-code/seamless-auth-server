---
"@seamless-auth/core": patch
---

Depend on `@seamless-auth/types` 0.29.0, which adds the optional OAuth state `binding` to the start response and callback request schemas. Apps now resolve a single copy of the types package alongside the client SDKs. The bundled adapter manifest fallback is refreshed against API 0.19.2 (routes unchanged).
