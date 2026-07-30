---
"@seamless-auth/core": minor
"@seamless-auth/express": patch
---

Give the auth API's contract values one home in `@seamless-auth/core`.

The external-delivery header and the service-token identity were written out at each call site: the `x-seamless-auth-delivery-mode: "external"` header in three core handlers, the fixed issuer and audience in three places across the adapter, and the `dev-main` key id fallback in three more. Each is defined by `seamless-auth-api`, so changing one is coordinated cross-repo work, and finding every copy was part of the job.

New exports: `AUTH_DELIVERY_MODE_HEADER`, `EXTERNAL_DELIVERY_MODE`, `EXTERNAL_DELIVERY_HEADERS`, `SERVICE_TOKEN_ISSUER`, `SERVICE_TOKEN_AUDIENCE`, `DEV_JWKS_KID`, `EXTERNAL_DELIVERY_TOKEN_SUBJECT`, and `buildExternalDeliveryAuthorization`, which mints the `Authorization` value for an external-delivery request.

No behavior change. The minted tokens carry the same header and claims as before, confirmed by decoding them. A new test asserts each contract value literally, so a change to one breaks a named test rather than surfacing as an upstream rejection at runtime.

The service-token issuer and audience are fixed by the API and are not the adopter's configured audience, which applies to user tokens. That is now stated where the constants are defined rather than in a comment at one of the call sites.

Part of #72.
