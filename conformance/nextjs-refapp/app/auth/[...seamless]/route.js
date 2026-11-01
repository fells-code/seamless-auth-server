import { authHandlers } from "../../../lib/seamless.mjs";

const handle = (request) => authHandlers()[request.method](request);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
