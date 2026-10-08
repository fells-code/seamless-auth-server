---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
"@seamless-auth/fastify": patch
"@seamless-auth/nextjs": patch
---

Keep ephemeral tokens out of cookie-transport response bodies (#202).

The OTP send routes (`POST /otp/generate-email-otp`, `/otp/generate-phone-otp`, `/otp/generate-login-email-otp`, `/otp/generate-login-phone-otp`) returned the ephemeral token the auth API re-mints on every send, and `POST /registration/register` returned the registration token it had just stored in the cookie. Page scripts could read both, which the httpOnly cookie exists to prevent. Under cookie transport these bodies no longer carry `token` or `refreshToken`. Bearer transport is unchanged, because the client holds its own tokens there.

`requestOtpHandler` takes an optional `transport`. Without it the token is dropped, so a caller serving bearer clients through this handler directly should pass `transport: "bearer"`.
