export { createSeamlessAuthHandler } from "./handler.js";
export type { RouteHandler, SeamlessAuthRouteHandlers } from "./handler.js";
export { createSeamlessConsoleProxy } from "./consoleProxy.js";
export type {
  SeamlessConsoleProxyHandlers,
  SeamlessConsoleProxyOptions,
} from "./consoleProxy.js";
export {
  getSeamlessClaims,
  getSeamlessSession,
  hasSeamlessSession,
} from "./session.js";
export type {
  CookieReader,
  SeamlessClaims,
  SeamlessSession,
  SeamlessSessionOptions,
} from "./session.js";
export type { ClientIpResolver, SeamlessAuthHandlerOptions } from "./options.js";
export type {
  AuthMessageOverrides,
  AuthMessagingHandlers,
  DeliveryResult,
  EmailMessage,
  EmailTransport,
  SeamlessAuthMessagingOptions,
  SeamlessAuthUser,
  SeamlessUser,
  SmsMessage,
  SmsTransport,
} from "@seamless-auth/core";
export { hasScopedRole, roleGrantsAccess } from "@seamless-auth/core";
