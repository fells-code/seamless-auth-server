import { jest } from "@jest/globals";

describe("authFetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("forwards trusted client IP and mirrors the service token header", async () => {
    const { authFetch } = await import("../dist/authFetch.js");

    await authFetch("https://auth.example.com/users/me", {
      method: "GET",
      authorization: "Bearer service-token",
      forwardedClientIp: "203.0.113.44",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/users/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer service-token",
          "x-seamless-service-token": "Bearer service-token",
          "x-seamless-client-ip": "203.0.113.44",
        }),
      }),
    );
  });

  it("uses an explicit serviceAuthorization override when provided", async () => {
    const { authFetch } = await import("../dist/authFetch.js");

    await authFetch("https://auth.example.com/refresh", {
      method: "POST",
      authorization: "Bearer refresh-token",
      serviceAuthorization: "Bearer service-token",
      forwardedClientIp: "203.0.113.44",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer refresh-token",
          "x-seamless-service-token": "Bearer service-token",
          "x-seamless-client-ip": "203.0.113.44",
        }),
      }),
    );
  });

  it("does not throw when the response body is non-JSON (e.g. a 429)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Too many requests, please try again later.",
    });

    const { authFetch } = await import("../dist/authFetch.js");
    const res = await authFetch("https://auth.example.com/otp/verify-email-otp", {
      method: "POST",
    });

    await expect(res.json()).resolves.toEqual({
      message: "Too many requests, please try again later.",
    });
  });

  it("parses a JSON body normally", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: "abc", sub: "user-1" }),
    });

    const { authFetch } = await import("../dist/authFetch.js");
    const res = await authFetch("https://auth.example.com/login", { method: "POST" });

    await expect(res.json()).resolves.toEqual({ token: "abc", sub: "user-1" });
  });

  it("returns undefined for an empty body (e.g. a 204)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => "",
    });

    const { authFetch } = await import("../dist/authFetch.js");
    const res = await authFetch("https://auth.example.com/magic-link/check", {
      method: "GET",
    });

    await expect(res.json()).resolves.toBeUndefined();
  });
});
