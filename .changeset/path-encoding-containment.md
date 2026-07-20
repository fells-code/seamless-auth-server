---
"@seamless-auth/core": patch
"@seamless-auth/express": patch
---

Close two path-encoding containment gaps.

The Express console proxy relied on `new URL` normalizing `..` segments to keep requests inside the mounted subtree, but WHATWG `URL` does not decode `%2f` or `%5c`, so `/console/..%2fadmin/users` passed the prefix check and was forwarded upstream verbatim where a decoding upstream could escape the console subtree. The proxy now rejects any subpath containing an encoded path separator with a 400.

The core `verifyMagicLinkHandler` interpolated its token into the upstream path without `encodeURIComponent`, unlike every sibling handler. A caller wiring it to a route param could send a traversal- or query-shaped token that reshaped the upstream request while carrying the caller's service authorization. The token is now encoded to a single path segment.
