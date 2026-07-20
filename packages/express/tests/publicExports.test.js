// Named imports from the built dist, exactly as the README and the templates write them.
// A missing named export fails this file at module link time, before any assertion runs.
import {
  createEnsureCookiesMiddleware,
  createSeamlessAuthServer,
  createSeamlessConsoleProxy,
  getSeamlessUser,
  hasScopedRole,
  requireAuth,
  requireRole,
  roleGrantsAccess,
} from "../dist/index.js";

import defaultExport from "../dist/index.js";

const DOCUMENTED_EXPORTS = {
  createEnsureCookiesMiddleware,
  createSeamlessAuthServer,
  createSeamlessConsoleProxy,
  getSeamlessUser,
  hasScopedRole,
  requireAuth,
  requireRole,
  roleGrantsAccess,
};

describe("@seamless-auth/express public exports", () => {
  it.each(Object.keys(DOCUMENTED_EXPORTS))(
    "exports %s as a named function",
    (name) => {
      expect(typeof DOCUMENTED_EXPORTS[name]).toBe("function");
    },
  );

  it("still exports createSeamlessAuthServer as the default", () => {
    expect(typeof defaultExport).toBe("function");
    expect(defaultExport).toBe(createSeamlessAuthServer);
  });

  it("exposes every documented name on the module namespace", async () => {
    const namespace = await import("../dist/index.js");
    const missing = Object.keys(DOCUMENTED_EXPORTS).filter(
      (name) => typeof namespace[name] !== "function",
    );

    expect(missing).toEqual([]);
  });
});
