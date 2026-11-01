// Loads the request type augmentation for anyone importing the package. The
// .js extension keeps it resolvable under NodeNext as well as bundler.
import "./types/express.js";
import {
  createSeamlessAuthServer,
  SeamlessAuthServerOptions,
  SeamlessAuthUser,
} from "./createServer.js";
export { createSeamlessAuthServer };
export { SeamlessAuthServerOptions, SeamlessAuthUser };
export { createSeamlessConsoleProxy } from "./consoleProxy.js";
export type { SeamlessConsoleProxyOptions } from "./consoleProxy.js";
export { requireAuth } from "./middleware/requireAuth.js";
export { requireRole } from "./middleware/requireRole.js";
export { createResourceServer } from "./middleware/resourceServer.js";
export type { ExpressResourceServer } from "./middleware/resourceServer.js";
export { createEnsureCookiesMiddleware } from "./middleware/ensureCookies.js";
export { getSeamlessUser } from "./getSeamlessUser.js";
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
  StepUpRequirement,
  SeamlessUser,
  SmsMessage,
  SmsTransport,
} from "@seamless-auth/core";
export { hasScopedRole, roleGrantsAccess } from "@seamless-auth/core";

export default createSeamlessAuthServer;
