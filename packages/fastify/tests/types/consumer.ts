// Resolves "@seamless-auth/fastify" by name through package.json `exports`, so
// it sees the built dist exactly as an installed consumer does.
import Fastify from "fastify";
import { requireAuth, requireRole } from "@seamless-auth/fastify";

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
