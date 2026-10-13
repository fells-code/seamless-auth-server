// Loads the request type augmentation for anyone importing the package. The
// .js extension keeps it resolvable under NodeNext as well as bundler.
import "./types/express.js";
import {
  createSeamlessAuthServer,
  SeamlessAuthServerOptions,
  SeamlessAuthUser,
} from "./createServer";
export { createSeamlessAuthServer };
export { SeamlessAuthServerOptions, SeamlessAuthUser };
export { createSeamlessConsoleProxy } from "./consoleProxy";
export type { SeamlessConsoleProxyOptions } from "./consoleProxy";
export { requireAuth } from "./middleware/requireAuth";
export { requireRole } from "./middleware/requireRole";
export { createEnsureCookiesMiddleware } from "./middleware/ensureCookies";
export { getSeamlessUser } from "./getSeamlessUser";
export type {
  AuthMessageOverrides,
  AuthMessagingHandlers,
  DeliveryResult,
  EmailMessage,
  EmailTransport,
  SeamlessAuthMessagingOptions,
  SeamlessUser,
  SmsMessage,
  SmsTransport,
} from "@seamless-auth/core";
export { hasScopedRole, roleGrantsAccess } from "@seamless-auth/core";

export default createSeamlessAuthServer;
