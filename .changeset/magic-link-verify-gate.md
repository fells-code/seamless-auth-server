---
"@seamless-auth/core": patch
---

Stop the cookie gate from rejecting cross-device magic-link verification. `/magic-link/verify/:token` was prefix-matched by the `/magic-link` pre-auth cookie requirement, so a link opened on a device without the pre-auth or refresh cookie returned `400 Missing required cookie`. The token in the verify URL is the credential, so that route is now explicitly ungated while `/magic-link` (request) and `/magic-link/check` (poll) keep requiring the pre-auth cookie.
