import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const { createSeamlessConsoleProxy } = await import("../dist/index.js");

const AUTH_SERVER_URL = "https://auth.example.com";

function createUpstreamResponse(status, body, headers = {}) {
  const encoded = typeof body === "string" ? Buffer.from(body) : body;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    body: encoded ? {} : null,
    arrayBuffer: async () =>
      encoded.buffer.slice(
        encoded.byteOffset,
        encoded.byteOffset + encoded.byteLength,
      ),
  };
}

function createApp() {
  const app = express();
  app.use(
    "/console",
    createSeamlessConsoleProxy({ authServerUrl: AUTH_SERVER_URL }),
  );
  return app;
}

function fetchUrls() {
  return global.fetch.mock.calls.map(([url]) => url.toString());
}

describe("console proxy", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("forwards an asset request and copies response headers", async () => {
    global.fetch.mockResolvedValue(
      createUpstreamResponse(200, "console.js()", {
        "content-type": "application/javascript",
        "cache-control": "public, max-age=31536000, immutable",
      }),
    );

    const res = await request(createApp()).get("/console/assets/x.js");

    expect(res.status).toBe(200);
    expect(res.text).toBe("console.js()");
    expect(res.headers["content-type"]).toBe("application/javascript");
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(fetchUrls()).toEqual([
      "https://auth.example.com/console/assets/x.js",
    ]);
  });

  it("forwards a deep client route so the upstream serves the SPA shell", async () => {
    global.fetch.mockResolvedValue(
      createUpstreamResponse(200, "<!doctype html><div id=root>", {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      }),
    );

    const res = await request(createApp()).get("/console/settings");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<div id=root>");
    expect(fetchUrls()).toEqual(["https://auth.example.com/console/settings"]);
  });

  it("forwards an upstream 404 as a 404", async () => {
    global.fetch.mockResolvedValue(
      createUpstreamResponse(404, "Not found", {
        "content-type": "text/plain",
      }),
    );

    const res = await request(createApp()).get("/console/missing.js");

    expect(res.status).toBe(404);
  });

  it("never proxies outside the console subtree on a traversal attempt", async () => {
    global.fetch.mockResolvedValue(
      createUpstreamResponse(404, "Not found", {
        "content-type": "text/plain",
      }),
    );

    await request(createApp()).get("/console/%2e%2e/auth/admin/users");
    await request(createApp()).get("/console/../auth/admin/users");

    for (const url of fetchUrls()) {
      expect(url.startsWith("https://auth.example.com/console")).toBe(true);
    }
  });

  it("does not forward Cookie or Authorization headers upstream", async () => {
    global.fetch.mockResolvedValue(
      createUpstreamResponse(200, "console.js()", {
        "content-type": "application/javascript",
      }),
    );

    await request(createApp())
      .get("/console/assets/x.js")
      .set("Cookie", "seamless-access=secret")
      .set("Authorization", "Bearer secret");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers).toBeUndefined();
  });

  it("returns 502 when the upstream fetch rejects", async () => {
    global.fetch.mockRejectedValue(new Error("network down"));

    const res = await request(createApp()).get("/console/assets/x.js");

    expect(res.status).toBe(502);
  });
});
