import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";

// An auth API access token as the cookie carries it. The guard reads its type,
// so a placeholder string would not pass for a session.
const INNER = jwt.sign({ sub: "user-1", typ: "access" }, "upstream-signing-key");

const { requireAuth } = await import("../dist/index.js");

describe("requireAuth (smoke)", () => {
  it("allows request and sets req.user when cookie is valid", async () => {
    const secret = "cookie-secret-cookie-secret-cookie-secret";

    const token = jwt.sign({ sub: "user-123", token: INNER }, secret, { expiresIn: "1h" });

    const app = express();
    app.use(cookieParser());
    app.use(
      requireAuth({
        cookieName: "access",
        cookieSecret: secret,
      }),
    );

    app.get("/protected", (req, res) => {
      res.json({ user: req.user });
    });

    const res = await request(app)
      .get("/protected")
      .set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("user-123");
  });

  it("forwards the inner access token as req.user.token", async () => {
    const secret = "cookie-secret-cookie-secret-cookie-secret";
    const innerAccessToken = INNER;

    const token = jwt.sign(
      { sub: "user-123", token: innerAccessToken },
      secret,
      { expiresIn: "1h" },
    );

    const app = express();
    app.use(cookieParser());
    app.use(
      requireAuth({
        cookieName: "access",
        cookieSecret: secret,
      }),
    );

    app.get("/protected", (req, res) => {
      res.json({ user: req.user });
    });

    const res = await request(app)
      .get("/protected")
      .set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.user.token).toBe(innerAccessToken);
  });

  // The pre-auth cookie /login issues for any existing account is signed with the
  // same secret, so a signature alone must not make a session.
  it("refuses a pre-auth cookie presented as the session cookie", async () => {
    const secret = "cookie-secret-cookie-secret-cookie-secret";
    const ephemeral = jwt.sign({ sub: "user-123", typ: "ephemeral" }, "upstream-signing-key");
    const token = jwt.sign({ sub: "user-123", token: ephemeral }, secret, { expiresIn: "1h" });

    const app = express();
    app.use(cookieParser());
    app.use(requireAuth({ cookieName: "access", cookieSecret: secret }));
    app.get("/protected", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/protected").set("Cookie", [`access=${token}`]);

    expect(res.status).toBe(401);
  });
});

