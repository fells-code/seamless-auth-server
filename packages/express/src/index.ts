import {
  createSeamlessAuthServer,
  SeamlessAuthServerOptions,
  SeamlessAuthUser,
} from "./createServer";
export { SeamlessAuthServerOptions, SeamlessAuthUser };
export { requireAuth } from "./middleware/requireAuth";
export { requireRole } from "./middleware/requireRole";
export { createEnsureCookiesMiddleware } from "./middleware/ensureCookies";
export { getSeamlessUser } from "./getSeamlessUser";

export default createSeamlessAuthServer;
