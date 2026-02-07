import {
  createSeamlessAuthServer,
  SeamlessAuthServerOptions,
} from "./createServer";
export { SeamlessAuthServerOptions };
export { requireAuth } from "./middleware/requireAuth";
export { requireRole } from "./middleware/requireRole";
export { createEnsureCookiesMiddleware } from "./middleware/ensureCookies";
export { getSeamlessUser } from "./getSeamlessUser";

export default createSeamlessAuthServer;
