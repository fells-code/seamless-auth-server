import { guarded } from "../../../lib/seamless.mjs";

// The conformance contract's protected endpoint, behind the adapter's own guard.
export const GET = guarded((_request, _context, user) =>
  Response.json({ id: user.id }),
);
