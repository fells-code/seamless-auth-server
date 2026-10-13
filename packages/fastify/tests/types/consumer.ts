// Resolves "@seamless-auth/fastify" by name through package.json `exports`, so
// it sees the built dist exactly as an installed consumer does.
import Fastify from "fastify";
import seamlessAuth, {
  getSeamlessUser,
  requireAuth,
  requireRole,
} from "@seamless-auth/fastify";

const app = Fastify();

app.get(
  "/me",
  {
    preHandler: [
      requireAuth({ cookieSecret: "x".repeat(64) }),
      requireRole("admin"),
    ],
  },
  async (req) => {
    const id: string | undefined = req.user?.id;
    const roles: string[] | undefined = req.user?.roles;
    const payload: Record<string, any> | undefined = req.cookiePayload;
    return { id, roles, payload };
  },
);

// Each wrong call below must be a type error. If an export resolves to `any`
// (an unresolvable import in the shipped .d.ts), the directive is unused and
// tsc fails.
// @ts-expect-error requireAuth takes an options object
requireAuth(42);
// @ts-expect-error requireRole takes a role name or list
requireRole(42);
// @ts-expect-error getSeamlessUser takes a request and options
getSeamlessUser(42);
// @ts-expect-error the plugin is registered with an options object
app.register(seamlessAuth, 42);
