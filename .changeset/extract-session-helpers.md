---
"@seamless-auth/core": patch
---

Extract the copy-pasted session helpers, with a typed `UpstreamSessionResponse`.

Seven handlers repeated the same block: verify the signed access token, check it describes the same subject as the response body, read the `sid` claim, then build the access and refresh cookie payloads. Seven copies of a security-relevant check is seven places to get an early return wrong, and the upstream fields were read untyped, so a rename on the API side surfaced as an undefined cookie field at runtime rather than a type error.

`issueSessionCookies` now does the whole thing in one call, `verifyUpstreamSession` is available for the one flow that verifies without issuing a session (login, which issues only the pre-auth cookie), and `UpstreamSessionResponse` states what the auth API returns when it issues a session. The handlers drop 220 lines.

One behavior change: the access cookie issued by `POST /webAuthn/register/finish` now carries `organizationId: null` where it previously omitted the key. Every other flow already included it, and the refresh path writes it on every reissue, so that session disagreed with itself after a single refresh. It is now consistent from the start.

New exports: `issueSessionCookies`, `verifyUpstreamSession`, `UpstreamSessionResponse`, `VerifiedUpstreamSession`, `IssueSessionCookiesOptions`.

Closes #136.
