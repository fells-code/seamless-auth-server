// Resolves "@seamless-auth/express" by name through package.json `exports`, so
// it sees the built dist exactly as an installed consumer does.
import express from "express";
import {
  createSeamlessAuthServer,
  getSeamlessUser,
  requireAuth,
  requireRole,
  type EmailMessage,
} from "@seamless-auth/express";

const app = express();

app.get(
  "/me",
  requireAuth({ cookieSecret: "x".repeat(64) }),
  requireRole("admin"),
  (req, res) => {
    const id: string | undefined = req.user?.id;
    const roles: string[] | undefined = req.user?.roles;
    const payload: Record<string, any> | undefined = req.cookiePayload;
    res.json({ id, roles, payload });
  },
);

// Each wrong call below must be a type error. If an export resolves to `any`
// (an unresolvable import in the shipped .d.ts), the directive is unused and
// tsc fails.
// @ts-expect-error requireAuth takes an options object
requireAuth(42);
// @ts-expect-error requireRole takes a role name or list
requireRole(42);
// @ts-expect-error createSeamlessAuthServer takes an options object
createSeamlessAuthServer(42);
// @ts-expect-error getSeamlessUser takes a request and options
getSeamlessUser(42);

const unsubscribable: EmailMessage = {
  to: "user@example.com",
  subject: "News",
  text: "Hello",
  headers: { "List-Unsubscribe": "<https://example.com/unsubscribe>" },
};
// @ts-expect-error header values are strings
const badHeader: EmailMessage = { ...unsubscribable, headers: { "X-Count": 1 } };
void badHeader;
