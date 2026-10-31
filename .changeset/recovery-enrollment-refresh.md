---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Rotate a recovery session right after it enrolls a factor. In cookie transport, a 2xx from `POST /webAuthn/register/finish` or `POST /totp/enroll/verify` made with a recovery session (`recovery: true` on the access token) now refreshes the session and sets new access and refresh cookies on the same response, so `requireAuth` stops answering `enrollment_required` at once, as the Go, Python and Rust adapters already do. When a silent refresh earlier in the request already rotated the session, the refresh token it issued is the one used, so the auth API never sees a replay; the cookies from that silent refresh are replaced rather than sent twice. If the refresh fails the enrollment answer is unchanged. Bearer transport is unchanged. Core exports `refreshAfterRecoveryEnrollment` and `refreshSessionToken`.
