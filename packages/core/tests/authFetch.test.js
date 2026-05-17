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
});
