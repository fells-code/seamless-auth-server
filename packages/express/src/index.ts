import { createSeamlessAuthServer } from "./createServer";
export { requireAuth } from "./middleware/requireAuth";
export { requireRole } from "./middleware/requireRole";
export { getSeamlessUser } from "./internal/getSeamlessUser"
export type { SeamlessAuthServerOptions } from "./types";

export default createSeamlessAuthServer;
