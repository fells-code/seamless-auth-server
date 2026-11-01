// Loads the request type augmentation for anyone importing the package. The
// .js extension keeps it resolvable under NodeNext as well as bundler.
import "./types/fastify.js";
import { seamlessAuth } from "./plugin.js";

export { seamlessAuth };
export { seamlessConsoleProxy } from "./consoleProxy.js";
export type { SeamlessConsoleProxyOptions } from "./consoleProxy.js";
export { requireAuth, requireRole } from "./guards.js";
export type { RequireAuthOptions } from "./guards.js";
export { createResourceServer } from "./resourceServer.js";
export type { FastifyResourceServer } from "./resourceServer.js";
export { getSeamlessUser } from "./getSeamlessUser.js";
export type { SeamlessAuthServerOptions } from "./options.js";
export type { ClientIpResolver } from "./internal/buildForwardedClientIp.js";
export { fastifyResponseAdapter } from "./internal/respond.js";
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

export default seamlessAuth;
