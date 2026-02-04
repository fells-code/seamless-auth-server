import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// Mock core ensureCookies
const ensureCookiesMock = jest.fn();

const { createEnsureCookiesMiddleware } = await import("../dist/index.js");

describe("createEnsureCookiesMiddleware (smoke)", () => {
  beforeEach(() => {
    ensureCookiesMock.mockReset();
  });

  it("calls next() when ensureCookies returns ok", async () => {
    ensureCookiesMock.mockResolvedValue({ type: "ok" });

    const app = express();
    app.use(
      createEnsureCookiesMiddleware({
        authServerUrl: "https://auth.example.com",
        cookieDomain: "example.com",
        accessCookieName: "access",
        registrationCookieName: "registration",
        refreshCookieName: "refresh",
        preAuthCookieName: "preauth",
        cookieSecret: "cookie-secret",
        serviceSecret: "service-secret",
        issuer: "https://frontend.example.com",
        audience: "https://auth.example.com",
        keyId: "dev-main",
      }),
    );

    app.get("/health", (req, res) => res.status(200).send("ok"));

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });
});
