// Loads the request type augmentation for anyone importing the package. The
// .js extension keeps it resolvable under NodeNext as well as bundler.
import "./types/fastify.js";
import { seamlessAuth } from "./plugin";

export { seamlessAuth };
export { seamlessConsoleProxy } from "./consoleProxy";
export type { SeamlessConsoleProxyOptions } from "./consoleProxy";
export { requireAuth, requireRole } from "./guards";
export type { RequireAuthOptions } from "./guards";
export { getSeamlessUser } from "./getSeamlessUser";
export type { SeamlessAuthServerOptions } from "./options";
export type { ClientIpResolver } from "./internal/buildForwardedClientIp";
export { fastifyResponseAdapter } from "./internal/respond";
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

export default seamlessAuth;
