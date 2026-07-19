import {
  createSeamlessAuthServer,
  SeamlessAuthServerOptions,
  SeamlessAuthUser,
} from "./createServer";
export { SeamlessAuthServerOptions, SeamlessAuthUser };
export { createSeamlessConsoleProxy } from "./consoleProxy";
export type { SeamlessConsoleProxyOptions } from "./consoleProxy";
export type {
  AuthMessageOverrides,
  AuthMessagingHandlers,
  DeliveryResult,
  EmailMessage,
  EmailTransport,
  SeamlessAuthMessagingOptions,
  SmsMessage,
  SmsTransport,
} from "./messaging";
export { requireAuth } from "./middleware/requireAuth";
export { requireRole } from "./middleware/requireRole";
export { createEnsureCookiesMiddleware } from "./middleware/ensureCookies";
export { getSeamlessUser } from "./getSeamlessUser";
export { hasScopedRole, roleGrantsAccess } from "@seamless-auth/core";

export default createSeamlessAuthServer;
