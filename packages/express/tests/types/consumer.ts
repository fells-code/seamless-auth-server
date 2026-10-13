// Resolves "@seamless-auth/express" by name through package.json `exports`, so
// it sees the built dist exactly as an installed consumer does.
import express from "express";
import { requireAuth, requireRole } from "@seamless-auth/express";

const app = express();

app.get(
  "/me",
  requireAuth({ cookieSecret: "x".repeat(64) }),
  requireRole("admin"),
  (req, res) => {
    const id: string | undefined = req.user?.id;
    const roles: string[] | undefined = req.user?.roles;
    const payload: Record<string, any> | undefined = req.cookiePayload;
    res.json({ id, roles, payload });
  },
);
