export { createSeamlessAuthHandler } from "./handler";
export type { RouteHandler, SeamlessAuthRouteHandlers } from "./handler";
export { createSeamlessConsoleProxy } from "./consoleProxy";
export type {
  SeamlessConsoleProxyHandlers,
  SeamlessConsoleProxyOptions,
} from "./consoleProxy";
export {
  getSeamlessClaims,
  getSeamlessSession,
  hasSeamlessSession,
} from "./session";
export type {
  CookieReader,
  SeamlessClaims,
  SeamlessSession,
  SeamlessSessionOptions,
} from "./session";
export type { ClientIpResolver, SeamlessAuthHandlerOptions } from "./options";
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
