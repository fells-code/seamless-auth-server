import { jest } from "@jest/globals";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const AUTH = "https://auth.example.com";
const SESSION_OPTS = {
  authServerUrl: AUTH,
  audience: AUTH,
  accessCookieName: "seamless-access",
  refreshCookieName: "seamless-refresh",
};

// Each handler builds cookies only from a complete session body. Anything short of
// one used to go back as-is, tokens included, in cookie transport too.
const HANDLERS = [
  [
    "verifyLoginOtpHandler",
    "verifyLoginOtpHandler.js",
    (fn, opts) => fn({ kind: "email", body: { code: "1" } }, opts),
    { message: "partial", refreshToken: "leaked" },
  ],
  [
    "pollMagicLinkConfirmationHandler",
    "pollMagicLinkConfirmationHandler.js",
    (fn, opts) => fn({}, opts),
    { message: "partial", token: "leaked", sub: "user-1" },
  ],
  [
    "switchOrganizationHandler",
    "switchOrganizationHandler.js",
    (fn, opts) => fn({ organizationId: "org-1" }, opts),
    { message: "partial", token: "leaked", refreshToken: "leaked" },
  ],
  [
    "verifyMagicLinkHandler",
    "verifyMagicLinkHandler.js",
    (fn, opts) => fn({ token: "link" }, opts),
    { message: "verified", token: "leaked" },
  ],
];

describe("handlers given an incomplete session body", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each(HANDLERS)(
    "%s drops tokens in cookie transport",
    async (name, file, run, body) => {
      const mod = await import(`../dist/handlers/${file}`);
      global.fetch = jest.fn(async () => jsonResponse(200, body));

      const result = await run(mod[name], SESSION_OPTS);

      expect(result.setCookies).toBeUndefined();
      expect(result.body).not.toHaveProperty("token");
      expect(result.body).not.toHaveProperty("refreshToken");
      expect(result.body.message).toBe(body.message);
    },
  );

  it.each(HANDLERS)(
    "%s returns the body whole in bearer transport",
    async (name, file, run, body) => {
      const mod = await import(`../dist/handlers/${file}`);
      global.fetch = jest.fn(async () => jsonResponse(200, body));

      const result = await run(mod[name], { ...SESSION_OPTS, transport: "bearer" });

      expect(result.body).toEqual(body);
    },
  );
});
