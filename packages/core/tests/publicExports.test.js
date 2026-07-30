// Named imports from the built dist, mirroring the "Public API (Overview)" README section.
// A missing named export fails this file at module link time, before any assertion runs.
import {
  applyCookies,
  applyExternalDelivery,
  applyResult,
  assertSecretStrength,
  assertSecrets,
  authFetch,
  buildExternalDeliveryAuthorization,
  buildQueryString,
  buildUpstreamUrl,
  checkProxyIdentity,
  createServiceToken,
  deliverAuthMessage,
  ensureCookies,
  finishLoginHandler,
  finishOAuthLoginHandler,
  finishRegisterHandler,
  getAuthEventsHandler,
  getAvailableRolesHandler,
  getDashboardMetricsHandler,
  getSeamlessUser,
  getUsersHandler,
  hasScopedRole,
  listOAuthProvidersHandler,
  listSessionsHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  pollMagicLinkConfirmationHandler,
  proxyRequest,
  redactSensitiveText,
  refreshAccessToken,
  registerHandler,
  requestMagicLinkHandler,
  requestOtpHandler,
  resolveCookieSameSite,
  roleGrantsAccess,
  signSessionCookie,
  startOAuthLoginHandler,
  stripDelivery,
  switchOrganizationHandler,
  updateUserHandler,
  verifyCookieJwt,
  verifyLoginOtpHandler,
  verifyMagicLinkHandler,
  verifyRefreshCookie,
  verifyRegistrationOtpHandler,
  verifySignedAuthResponse,
  AUTH_DELIVERY_MODE_HEADER,
  DEV_JWKS_KID,
  EXTERNAL_DELIVERY_HEADERS,
  EXTERNAL_DELIVERY_MODE,
  SERVICE_TOKEN_AUDIENCE,
  SERVICE_TOKEN_ISSUER,
} from "../dist/index.js";

const DOCUMENTED_FUNCTIONS = {
  applyCookies,
  applyExternalDelivery,
  applyResult,
  assertSecretStrength,
  assertSecrets,
  authFetch,
  buildExternalDeliveryAuthorization,
  buildQueryString,
  buildUpstreamUrl,
  checkProxyIdentity,
  createServiceToken,
  deliverAuthMessage,
  ensureCookies,
  finishLoginHandler,
  finishOAuthLoginHandler,
  finishRegisterHandler,
  getAuthEventsHandler,
  getAvailableRolesHandler,
  getDashboardMetricsHandler,
  getSeamlessUser,
  getUsersHandler,
  hasScopedRole,
  listOAuthProvidersHandler,
  listSessionsHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  pollMagicLinkConfirmationHandler,
  proxyRequest,
  redactSensitiveText,
  refreshAccessToken,
  registerHandler,
  requestMagicLinkHandler,
  requestOtpHandler,
  resolveCookieSameSite,
  roleGrantsAccess,
  signSessionCookie,
  startOAuthLoginHandler,
  stripDelivery,
  switchOrganizationHandler,
  updateUserHandler,
  verifyCookieJwt,
  verifyLoginOtpHandler,
  verifyMagicLinkHandler,
  verifyRefreshCookie,
  verifyRegistrationOtpHandler,
  verifySignedAuthResponse,
};

const DOCUMENTED_CONSTANTS = {
  AUTH_DELIVERY_MODE_HEADER,
  DEV_JWKS_KID,
  EXTERNAL_DELIVERY_MODE,
  SERVICE_TOKEN_AUDIENCE,
  SERVICE_TOKEN_ISSUER,
};

describe("@seamless-auth/core public exports", () => {
  it.each(Object.keys(DOCUMENTED_FUNCTIONS))(
    "exports %s as a named function",
    (name) => {
      expect(typeof DOCUMENTED_FUNCTIONS[name]).toBe("function");
    },
  );

  it.each(Object.keys(DOCUMENTED_CONSTANTS))(
    "exports %s as a named string constant",
    (name) => {
      expect(typeof DOCUMENTED_CONSTANTS[name]).toBe("string");
    },
  );

  it("exports the external delivery headers as an object", () => {
    expect(EXTERNAL_DELIVERY_HEADERS).toEqual({
      [AUTH_DELIVERY_MODE_HEADER]: EXTERNAL_DELIVERY_MODE,
    });
  });

  it("exposes every documented name on the module namespace", async () => {
    const namespace = await import("../dist/index.js");
    const missing = [
      ...Object.keys(DOCUMENTED_FUNCTIONS),
      ...Object.keys(DOCUMENTED_CONSTANTS),
    ].filter((name) => namespace[name] === undefined);

    expect(missing).toEqual([]);
  });

  // The subpaths predate the root exports and adopters import from them, so they
  // have to keep resolving to the same functions.
  it.each([
    ["admin", "getUsersHandler"],
    ["sessions", "listSessionsHandler"],
    ["internalMetrics", "getDashboardMetricsHandler"],
    ["systemConfig", "getAvailableRolesHandler"],
  ])("keeps handlers/%s reachable by subpath", async (module, exported) => {
    const namespace = await import(`../dist/handlers/${module}.js`);
    const root = await import("../dist/index.js");

    expect(namespace[exported]).toBe(root[exported]);
  });
});
