import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";

const { requireAuth } = await import("../dist/index.js");

describe("requireAuth (smoke)", () => {
  it("allows request and sets req.user when cookie is valid", async () => {
    const secret = "cookie-secret";

    const token = jwt.sign({ sub: "user-123" }, secret, { expiresIn: "1h" });

    const app = express();
    app.use(cookieParser()); // 🔑 REQUIRED
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
    expect(res.body.user.sub).toBe("user-123");
  });
});
