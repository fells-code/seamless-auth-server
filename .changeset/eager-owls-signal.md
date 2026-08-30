---
'@seamless-auth/core': minor
---

Answer 401, not 400, when nobody is signed in.

`ensureCookies` gates every access-required route. When the required cookie was
absent and there was no refresh cookie to fall back on, which is exactly the
signed-out case, it answered `400`. The request was perfectly well formed. There
was simply no session, and that is what `401` means.

This is a behaviour change for adopters. Anything branching on `400` from an
`/auth` route to detect a malformed request will now see `401` for a signed-out
visitor instead.

Two things went wrong with the old status. Every signed-out page view produced
`400`s, so `400` became ordinary background traffic in adopter logs and would
hide a real malformed request from anyone watching. And consumers translate
status codes into words for readers: `400` asks a product to say "that request
did not come through in a form we could use" when the true sentence is "you have
been signed out, sign in again".

The neighbouring branches in the same function already answered `401` for a
refresh that failed and for a cookie that was invalid or expired, so this branch
was the outlier rather than the convention. All three now agree, and the status
no longer depends on which way the session happened to be absent. The response
body is unchanged.
