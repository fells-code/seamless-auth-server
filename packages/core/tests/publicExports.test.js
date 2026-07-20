// Named imports from the built dist, mirroring the "Public API (Overview)" README section.
// A missing named export fails this file at module link time, before any assertion runs.
import {
  assertSecretStrength,
  assertSecrets,
  createServiceToken,
  ensureCookies,
  finishOAuthLoginHandler,
  getSeamlessUser,
  hasScopedRole,
  listOAuthProvidersHandler,
  refreshAccessToken,
  startOAuthLoginHandler,
  verifyCookieJwt,
} from "../dist/index.js";

const DOCUMENTED_EXPORTS = {
  assertSecretStrength,
  assertSecrets,
  createServiceToken,
  ensureCookies,
  finishOAuthLoginHandler,
  getSeamlessUser,
  hasScopedRole,
  listOAuthProvidersHandler,
  refreshAccessToken,
  startOAuthLoginHandler,
  verifyCookieJwt,
};

describe("@seamless-auth/core public exports", () => {
  it.each(Object.keys(DOCUMENTED_EXPORTS))(
    "exports %s as a named function",
    (name) => {
      expect(typeof DOCUMENTED_EXPORTS[name]).toBe("function");
    },
  );

  it("exposes every documented name on the module namespace", async () => {
    const namespace = await import("../dist/index.js");
    const missing = Object.keys(DOCUMENTED_EXPORTS).filter(
      (name) => typeof namespace[name] !== "function",
    );

    expect(missing).toEqual([]);
  });
});
