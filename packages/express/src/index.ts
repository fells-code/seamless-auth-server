import {
  createSeamlessAuthServer,
  SeamlessAuthServerOptions,
  SeamlessAuthUser,
} from "./createServer";
export { SeamlessAuthServerOptions, SeamlessAuthUser };
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

export default createSeamlessAuthServer;
