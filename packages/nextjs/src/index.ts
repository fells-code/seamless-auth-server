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
export type {
  ClientIpResolver,
  SeamlessAuthHandlerOptions,
} from "./options.js";
export { createResourceServer } from "./resourceServer.js";
export type {
  NextResourceServer,
  ResourceServerRequirements,
  ResourceServerResult,
  ResourceServerRouteHandler,
} from "./resourceServer.js";
export type {
  AuthMessageOverrides,
  AuthMessagingHandlers,
  DeliveryResult,
  EmailMessage,
  EmailTransport,
  ResourceServerClaims,
  ResourceServerOptions,
  ResourceServerUser,
  SeamlessAuthMessagingOptions,
  SendEnrollmentInviteEmailInput,
  SeamlessAuthUser,
  SeamlessUser,
  SmsMessage,
  SmsTransport,
  StepUpRequirement,
} from "@seamless-auth/core";
export { hasScopedRole, roleGrantsAccess } from "@seamless-auth/core";
