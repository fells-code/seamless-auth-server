// Framework-specific behaviour of the console proxy. The parity suite covers
// what it has to answer identically to the Express adapter.
import { jest } from "@jest/globals";
import Fastify from "fastify";

const { seamlessConsoleProxy } = await import("../dist/index.js");

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

function asset(body = "console.js()") {
  return createUpstreamResponse(200, body, {
    "content-type": "application/javascript",
  });
}

async function createApp(options = {}) {
  const app = Fastify();
  await app.register(seamlessConsoleProxy, {
    prefix: "/console",
    authServerUrl: AUTH_SERVER_URL,
    ...options,
  });
  await app.ready();
  return app;
}

async function inject(app, request) {
  try {
    return await app.inject(request);
  } finally {
    await app.close();
  }
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

  it("serves the SPA shell at the prefix root, with or without a trailing slash", async () => {
    global.fetch.mockResolvedValue(
      createUpstreamResponse(200, "<!doctype html><div id=root>", {
        "content-type": "text/html; charset=utf-8",
      }),
    );

    const bare = await inject(await createApp(), {
      method: "GET",
      url: "/console",
    });
    const slashed = await inject(await createApp(), {
      method: "GET",
      url: "/console/",
    });

    expect(bare.statusCode).toBe(200);
    expect(slashed.statusCode).toBe(200);
    expect(bare.body).toContain("<div id=root>");
    expect(fetchUrls()).toEqual([
      "https://auth.example.com/console",
      "https://auth.example.com/console",
    ]);
  });

  it("proxies from a custom prefix to the upstream console subtree", async () => {
    global.fetch.mockResolvedValue(asset());

    const app = await createApp({ prefix: "/admin-ui" });
    const res = await inject(app, {
      method: "GET",
      url: "/admin-ui/assets/x.js",
    });

    expect(res.statusCode).toBe(200);
    expect(fetchUrls()).toEqual([
      "https://auth.example.com/console/assets/x.js",
    ]);
  });

  it("requests a custom basePath upstream", async () => {
    global.fetch.mockResolvedValue(asset());

    const app = await createApp({ basePath: "dashboard/" });
    const res = await inject(app, {
      method: "GET",
      url: "/console/assets/x.js",
    });

    expect(res.statusCode).toBe(200);
    expect(fetchUrls()).toEqual([
      "https://auth.example.com/dashboard/assets/x.js",
    ]);
  });

  it("answers HEAD with the upstream headers and no body", async () => {
    global.fetch.mockResolvedValue(asset());

    const res = await inject(await createApp(), {
      method: "HEAD",
      url: "/console/assets/x.js",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/javascript");
    expect(res.body).toBe("");
  });

  it("does not forward Cookie or Authorization headers upstream", async () => {
    global.fetch.mockResolvedValue(asset());

    await inject(await createApp(), {
      method: "GET",
      url: "/console/assets/x.js",
      headers: {
        cookie: "seamless-access=secret",
        authorization: "Bearer secret",
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers).toBeUndefined();
  });

  // With ignoreDuplicateSlashes the router matches a path the raw url does not
  // start with, so there is no subpath to trust.
  it("rejects a request whose url no longer starts with the mount path", async () => {
    const app = Fastify({ routerOptions: { ignoreDuplicateSlashes: true } });
    await app.register(seamlessConsoleProxy, {
      prefix: "/console",
      authServerUrl: AUTH_SERVER_URL,
    });
    await app.ready();

    const res = await inject(app, {
      method: "GET",
      url: "//console/assets/x.js",
    });

    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
