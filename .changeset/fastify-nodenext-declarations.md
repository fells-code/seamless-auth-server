---
"@seamless-auth/fastify": patch
---

Publish declarations that resolve under `moduleResolution: "NodeNext"` and `"Node16"`. Relative imports in the shipped `.d.ts` files now carry explicit `.js` extensions. Consumers on NodeNext previously could not resolve them, so the exported functions typed as `any` (hidden by `skipLibCheck`). Runtime output is unchanged.
