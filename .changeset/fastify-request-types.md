---
"@seamless-auth/fastify": patch
---

Load the `FastifyRequest` augmentation (`request.user`, `request.cookiePayload`) from the package entry through an import that resolves under `moduleResolution: "NodeNext"`. Consumers on NodeNext previously lost it because the entry reached it only through an extensionless relative import.
