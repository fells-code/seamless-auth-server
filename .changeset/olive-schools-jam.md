---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Correct published package metadata. Both packages now declare `engines.node` matching the Node 24 repo baseline, point `repository.url` at the repo root with a `directory` field, and declare a `bugs` URL. The express package gains the `homepage` field the core package already had.
