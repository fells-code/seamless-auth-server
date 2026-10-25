---
"@seamless-auth/core": minor
"@seamless-auth/express": minor
"@seamless-auth/fastify": minor
"@seamless-auth/nextjs": minor
---

Support for the auth server's v0.20 account recovery, built on `@seamless-auth/types` 0.31.0.

- **Recovery sessions are refused by default.** An access token from account recovery or a recovery code carries `recovery: true` and can only enroll a new passkey or authenticator app. `requireAuth` (Express, Fastify) answers it with `403 { "error": "enrollment_required" }`, and the Next.js `getSeamlessSession` and `getSeamlessClaims` treat it as signed out, unless `allowRecoverySession: true` is passed. Set it only where the app drives that enrollment. After enrolling, a refresh issues a token without the claim.
- **Account notices.** On routes the auth server's manifest marks `notices: true` (today `POST /recovery/verify`), an adapter with `messaging` names the notice kinds it can send in `x-seamless-auth-delivery-kinds` and delivers the `account_notice_email` / `account_notice_sms` items the server returns. These items are its "recovery opened" notice with a cancel link, which goes only to the owner and is never logged. If none goes out, the adapter cancels the request with that link's token and answers `503 recovery_notice_failed`, so recovery never runs without the owner being told. New `handlers.sendAccountNoticeEmail` / `sendAccountNoticeSms` and `overrides.accountNoticeEmail` / `accountNoticeSms`; the default sends the server's text as plain text.
- An OTP sent for account recovery (`purpose: "account_recovery"`) is worded as a recovery code, and the purpose is passed to custom OTP handlers and overrides.
- The bundled fallback manifest now includes the v0.20 routes, including the recovery, recovery code and staged policy routes.
