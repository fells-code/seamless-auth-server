// Behavior the console proxy owns because a route handler has no framework
// underneath: mounting, method exports, and building the `Response`. Behavior
// shared with the other adapters is in the parity suite.
import { jest } from "@jest/globals";

const { createSeamlessConsoleProxy } = await import("../dist/index.js");

const AUTH_SERVER_URL = "https://auth.example.com";

function asset() {
  return new Response("console.js()", {
    status: 200,
    headers: {
      "content-type": "application/javascript",
      etag: '"abc"',
      "set-cookie": "upstream=1",
    },
  });
}

function fetchedUrls() {
  return global.fetch.mock.calls.map(([url]) => url.toString());
}

describe("createSeamlessConsoleProxy", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async () => asset());
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("exports only the read methods, so Next.js refuses a write itself", () => {
    const handlers = createSeamlessConsoleProxy({
      authServerUrl: AUTH_SERVER_URL,
    });

    expect(Object.keys(handlers).sort()).toEqual(["GET", "HEAD"]);
  });

  it("refuses a write wired to a read export without fetching upstream", async () => {
    const { GET } = createSeamlessConsoleProxy({
      authServerUrl: AUTH_SERVER_URL,
    });

    const res = await GET(
      new Request("http://localhost/console/assets/x.js", { method: "POST" }),
    );

    expect(res.status).toBe(405);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("answers HEAD with the headers and no body", async () => {
    const { HEAD } = createSeamlessConsoleProxy({
      authServerUrl: AUTH_SERVER_URL,
    });

    const res = await HEAD(
      new Request("http://localhost/console/assets/x.js", { method: "HEAD" }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/javascript");
    expect(await res.text()).toBe("");
    expect(global.fetch.mock.calls[0][1].method).toBe("HEAD");
  });

  it("forwards only the allowlisted response headers", async () => {
    const { GET } = createSeamlessConsoleProxy({
      authServerUrl: AUTH_SERVER_URL,
    });

    const res = await GET(new Request("http://localhost/console/assets/x.js"));

    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does not forward Cookie or Authorization headers upstream", async () => {
    const { GET } = createSeamlessConsoleProxy({
      authServerUrl: AUTH_SERVER_URL,
    });

    await GET(
      new Request("http://localhost/console/assets/x.js", {
        headers: {
          cookie: "seamless-access=secret",
          authorization: "Bearer secret",
        },
      }),
    );

    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers).toBeUndefined();
  });

  it("passes an upstream null-body status through without a body", async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 304 }));
    const { GET } = createSeamlessConsoleProxy({
      authServerUrl: AUTH_SERVER_URL,
    });

    const res = await GET(new Request("http://localhost/console/assets/x.js"));

    expect(res.status).toBe(304);
  });

  it("strips a custom mount path, including a Next.js basePath", async () => {
    const { GET } = createSeamlessConsoleProxy({
      authServerUrl: AUTH_SERVER_URL,
      mountPath: "/app/console/",
    });

    const res = await GET(
      new Request("http://localhost/app/console/assets/x.js"),
    );

    expect(res.status).toBe(200);
    expect(fetchedUrls()).toEqual([
      "https://auth.example.com/console/assets/x.js",
    ]);
  });

  it("requests a custom upstream subtree under the auth server's path", async () => {
    const { GET } = createSeamlessConsoleProxy({
      authServerUrl: "https://example.com/seamless/",
      basePath: "admin",
    });

    await GET(new Request("http://localhost/console/settings"));

    expect(fetchedUrls()).toEqual(["https://example.com/seamless/admin/settings"]);
  });

  it("refuses a path outside the mount without fetching upstream", async () => {
    const { GET } = createSeamlessConsoleProxy({
      authServerUrl: AUTH_SERVER_URL,
    });

    const outside = await GET(new Request("http://localhost/consoleish/x.js"));
    const escaped = await GET(
      new Request("http://localhost/console/%2e%2e/auth/admin/users"),
    );

    expect(outside.status).toBe(400);
    expect(escaped.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
