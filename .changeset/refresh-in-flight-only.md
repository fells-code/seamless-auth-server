---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Stop replaying a completed refresh rotation to later callers (#258). After a successful rotation, the adapter used to hand the new session to any caller presenting the same old refresh cookie or bearer refresh token for the next 5 seconds, without calling the auth API, so a stolen refresh token replayed in that window got the new tokens and the auth API's reuse detection never saw it.

Only a rotation still in flight is shared now. A request that presents a refresh token after its rotation completed goes to the auth API, which treats it as a replay: the cookie path answers as an expired session, and a bearer client gets the API's `401 {"error":"refresh_token_reused"}`. Two browser tabs that send the same old refresh cookie a moment apart, rather than at the same time, can now trip that reuse detection and sign the user out.
