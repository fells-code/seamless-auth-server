export * from "./authFetch.js";
export * from "./authMessaging.js";
export * from "./deliverAuthMessage.js";
export * from "./ensureCookies.js";
export * from "./verifyCookieJwt.js";
export * from "./verifyRefreshCookie.js";
export * from "./verifySignedAuthResponse.js";
export * from "./refreshAccessToken.js";
export * from "./getSeamlessUser.js";
export * from "./logger.js";
export * from "./guards.js";
export * from "./createServiceToken.js";
export * from "./validateSecrets.js";
// Role matching decides whether a request is authorized, and the auth API runs
// the same check on its side. Both take it from @seamless-auth/types so the two
// cannot drift into disagreeing about who can do what. The /role/matching entry
// is the zod-free one, so importing core does not pull zod or the schema barrel.
export {
  hasScopedRole,
  roleGrantsAccess,
} from "@seamless-auth/types/role/matching";
export * from "./apiContract.js";
export * from "./applyResult.js";
export * from "./proxyRequest.js";
export * from "./result.js";
export * from "./upstreamSession.js";
export * from "./redaction.js";

export * from "./handlers/login.js";
export * from "./handlers/finishLogin.js";
export * from "./handlers/register.js";
export * from "./handlers/finishRegister.js";
export * from "./handlers/logout.js";
export * from "./handlers/me.js";
export * from "./handlers/requestOtpHandler.js";
export * from "./handlers/verifyLoginOtpHandler.js";
export * from "./handlers/verifyMagicLinkHandler.js";
export * from "./handlers/requestMagicLinkHandler.js";
export * from "./handlers/pollMagicLinkConfirmationHandler.js";
export * from "./handlers/switchOrganizationHandler.js";
export * from "./handlers/oauthHandlers.js";
export * from "./handlers/admin.js";
export * from "./handlers/sessions.js";
export * from "./handlers/internalMetrics.js";
export * from "./handlers/systemConfig.js";
