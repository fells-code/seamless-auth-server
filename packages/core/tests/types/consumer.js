// Resolves "@seamless-auth/core" by name through package.json `exports`, so it
// sees the built dist exactly as an installed consumer does.
import { verifyCookieJwt } from "@seamless-auth/core";
import { loginHandler } from "@seamless-auth/core/handlers/login";
const claims = verifyCookieJwt("token", "secret");
void claims;
// Each wrong call below must be a type error. If an export resolves to `any`
// (an unresolvable import in the shipped .d.ts), the directive is unused and
// tsc fails.
// @ts-expect-error verifyCookieJwt takes a token and a secret
verifyCookieJwt(42);
// @ts-expect-error loginHandler takes an input and options
loginHandler(42);
//# sourceMappingURL=consumer.js.map