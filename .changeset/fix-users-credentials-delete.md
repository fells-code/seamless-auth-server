---
"@seamless-auth/express": patch
---

Fix `DELETE /users/credentials` proxying to the auth API as a `POST`. The adapter now forwards the request as a `DELETE`, matching the API's `deleteCredential` contract (the previous default hit `updateCredential` instead).
