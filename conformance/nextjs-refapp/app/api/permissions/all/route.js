import { permissionGuarded } from "../../../../lib/seamless.mjs";

export const GET = permissionGuarded(["conformance:read", "conformance:write"], {
  match: "all",
});
