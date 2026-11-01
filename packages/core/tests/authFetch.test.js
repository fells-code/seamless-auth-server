import { jest } from "@jest/globals";
import http from "node:http";

describe("authFetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("never mirrors the user token into the service token header", async () => {
    const { authFetch } = await import("../dist/authFetch.js");

    await authFetch("https://auth.example.com/users/me", {
      method: "GET",
      authorization: "Bearer user-access-token",
      forwardedClientIp: "203.0.113.44",
    });

    const [, init] = global.fetch.mock.calls[0];

    expect(init.headers.Authorization).toBe("Bearer user-access-token");
    expect(init.headers["x-seamless-client-ip"]).toBe("203.0.113.44");
    expect(init.headers).not.toHaveProperty("x-seamless-service-token");
  });

  it("forwards the browser user agent under its own header, and only when given", async () => {
    const { authFetch } = await import("../dist/authFetch.js");

    await authFetch("https://auth.example.com/login", {
      method: "POST",
      forwardedUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    });

    const [, withAgent] = global.fetch.mock.calls[0];

    expect(withAgent.headers["x-seamless-client-user-agent"]).toBe(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    );

    await authFetch("https://auth.example.com/login", { method: "POST" });

    const [, without] = global.fetch.mock.calls[1];

    expect(without.headers).not.toHaveProperty("x-seamless-client-user-agent");
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

  it("does not throw when the response body is non-JSON (e.g. a proxy error page)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "<html><body>502 Bad Gateway</body></html>",
    });

    const { authFetch } = await import("../dist/authFetch.js");
    const res = await authFetch("https://auth.example.com/otp/verify-email-otp", {
      method: "POST",
    });

    await expect(res.json()).resolves.toEqual({
      message: "<html><body>502 Bad Gateway</body></html>",
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

  it("asks fetch not to follow redirects", async () => {
    const { authFetch } = await import("../dist/authFetch.js");

    await authFetch("https://auth.example.com/users/me", { method: "GET" });

    expect(global.fetch.mock.calls[0][1].redirect).toBe("manual");
  });
});

describe("authFetch against a redirecting upstream", () => {
  const servers = [];

  async function listen(handler) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  }

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))),
    );
  });

  it.each([301, 302, 307, 308])(
    "answers %i as a 502 without resending the credentials",
    async (status) => {
      const { authFetch, UPSTREAM_REDIRECT_ERROR_CODE } = await import(
        "../dist/authFetch.js"
      );
      const elsewhere = jest.fn((_req, res) => res.end("{}"));
      const target = await listen(elsewhere);
      const api = await listen((_req, res) => {
        res.writeHead(status, { location: `${target}/stolen` });
        res.end();
      });

      const response = await authFetch(`${api}/admin/users`, {
        method: "POST",
        body: { userId: "u1" },
        authorization: "Bearer user-access-token",
        serviceAuthorization: "service-token",
      });

      expect(response.status).toBe(502);
      expect(response.ok).toBe(false);
      expect(await response.json()).toEqual({ error: UPSTREAM_REDIRECT_ERROR_CODE });
      expect(elsewhere).not.toHaveBeenCalled();
    },
  );

  it("answers 502 upstream_unavailable when the API does not answer in time", async () => {
    const { authFetch, UPSTREAM_UNAVAILABLE_ERROR_CODE } = await import(
      "../dist/authFetch.js"
    );
    const api = await listen(() => {});

    const response = await authFetch(`${api}/login`, {
      method: "POST",
      timeoutMs: 50,
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: UPSTREAM_UNAVAILABLE_ERROR_CODE });
  });

  it("answers 502 upstream_unavailable when the API cannot be reached", async () => {
    const { authFetch, UPSTREAM_UNAVAILABLE_ERROR_CODE } = await import(
      "../dist/authFetch.js"
    );
    const api = await listen(() => {});
    await new Promise((resolve) => servers.pop().close(resolve));

    const response = await authFetch(`${api}/login`, { method: "POST" });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: UPSTREAM_UNAVAILABLE_ERROR_CODE });
  });

  it("applies a timeout to every call by default", async () => {
    const { authFetch } = await import("../dist/authFetch.js");
    const original = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    try {
      await authFetch("https://auth.example.com/login", { method: "POST" });
      expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      global.fetch = original;
    }
  });
});
