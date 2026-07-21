---
"@seamless-auth/express": patch
---

Remove the redundant `as any` / option-object casts across the Express adapter so the compiler checks each option literal against its handler interface. These casts were the construct that previously let a mistyped option (`serviceAuthorization`) be silently dropped. No public API change. One internal cleanup with a visible edge case: the internal metrics handlers now reduce an array-valued query parameter to its first value rather than letting it reach the upstream comma-joined, which the scalar handler contract never supported.
