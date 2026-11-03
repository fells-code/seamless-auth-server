---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Stop replaying a completed bearer refresh rotation to later callers (#258). After a successful rotation, the adapter used to hand the new session to any caller presenting the same old refresh cookie or bearer refresh token for the next 5 seconds, without calling the auth API, so a stolen bearer refresh token replayed in that window got the new tokens and the auth API's reuse detection never saw it.

Bearer transport now shares only a rotation still in flight. A bearer client that presents a refresh token after its rotation completed goes to the auth API, which treats it as a replay and answers `401 {"error":"refresh_token_reused"}`.

Cookie transport keeps the 5 second window, because browser tabs share one refresh cookie and a second tab sending the old cookie just after the first tab's rotation is expected. Within 5 seconds of a successful rotation the old refresh cookie gets the same rotated session; after that it goes to the auth API as a replay. A failed rotation is never kept, and the window is keyed on a hash of the cookie.
