import { jest } from "@jest/globals";

const {
  BUNDLED_ADAPTER_MANIFEST,
} = await import("../dist/manifest/bundledManifest.js");
const {
  buildManifestPath,
  createAdapterManifestSource,
  matchManifestRoute,
  parseAdapterManifest,
} = await import("../dist/manifest/adapterManifest.js");

const manifest = {
  schemaVersion: 1,
  apiVersion: "1.0.0",
  session: {},
  routes: [
    { method: "GET", path: "/admin/users/{userId}", credential: "access" },
    { method: "POST", path: "/admin/users/import", credential: "access" },
    { method: "POST", path: "/webauthn/login/start", credential: "preAuth" },
    { method: "GET", path: "/magic-link/verify/{token}", credential: "none" },
  ],
};

describe("parseAdapterManifest", () => {
  it("accepts a schemaVersion 1 manifest", () => {
    expect(parseAdapterManifest(manifest)).toBe(manifest);
  });

  it("accepts the bundled manifest", () => {
    expect(parseAdapterManifest(BUNDLED_ADAPTER_MANIFEST)).toBeDefined();
  });

  it("refuses an unknown schema version", () => {
    expect(parseAdapterManifest({ ...manifest, schemaVersion: 2 })).toBeUndefined();
  });

  // A route with a credential this version cannot follow would be proxied with
  // the wrong token, so the whole manifest is refused instead.
  it("refuses a manifest with a credential it does not understand", () => {
    expect(
      parseAdapterManifest({
        ...manifest,
        routes: [{ method: "GET", path: "/x", credential: "device" }],
      }),
    ).toBeUndefined();
  });

  it("refuses a manifest with an unknown effect", () => {
    expect(
      parseAdapterManifest({
        ...manifest,
        routes: [
          { method: "GET", path: "/x", credential: "none", issues: "everything" },
        ],
      }),
    ).toBeUndefined();
  });

  it("refuses non-objects", () => {
    expect(parseAdapterManifest(null)).toBeUndefined();
    expect(parseAdapterManifest("manifest")).toBeUndefined();
  });
});

describe("matchManifestRoute", () => {
  it("matches path parameters and decodes them", () => {
    expect(matchManifestRoute(manifest, "get", "/admin/users/a%2Fb")).toEqual({
      route: manifest.routes[0],
      params: { userId: "a/b" },
    });
  });

  it("prefers a static segment over a parameter", () => {
    expect(
      matchManifestRoute(manifest, "POST", "/admin/users/import")?.route.path,
    ).toBe("/admin/users/import");
  });

  it("compares static segments case-insensitively", () => {
    expect(
      matchManifestRoute(manifest, "POST", "/webAuthn/login/start")?.route.path,
    ).toBe("/webauthn/login/start");
  });

  it("requires the method to match", () => {
    expect(matchManifestRoute(manifest, "DELETE", "/admin/users/1")).toBeUndefined();
  });

  it("requires the segment count to match", () => {
    expect(matchManifestRoute(manifest, "GET", "/admin/users")).toBeUndefined();
    expect(matchManifestRoute(manifest, "GET", "/admin/users/1/x")).toBeUndefined();
  });

  it.each(["..", ".", "%2E%2E", "%2e"])(
    "does not match a dot segment as a parameter (%s)",
    (segment) => {
      expect(matchManifestRoute(manifest, "GET", `/admin/users/${segment}`)).toBeUndefined();
    },
  );

  it("does not match a malformed percent-encoding", () => {
    expect(matchManifestRoute(manifest, "GET", "/magic-link/verify/%E0%A4%A")).toBeUndefined();
  });
});

describe("buildManifestPath", () => {
  it("encodes each parameter", () => {
    expect(buildManifestPath(manifest.routes[0], { userId: "a/b?c" })).toBe(
      "/admin/users/a%2Fb%3Fc",
    );
  });
});

describe("createAdapterManifestSource", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches the manifest once and keeps it", async () => {
    global.fetch = jest.fn(async () => Response.json(manifest));
    const source = createAdapterManifestSource({ authServerUrl: "https://auth.test" });

    await expect(source.get()).resolves.toEqual(manifest);
    await expect(source.get()).resolves.toEqual(manifest);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.test/.well-known/seamless-adapter.json",
      expect.anything(),
    );
  });

  it("shares one fetch between concurrent callers", async () => {
    global.fetch = jest.fn(async () => Response.json(manifest));
    const source = createAdapterManifestSource({ authServerUrl: "https://auth.test" });

    await Promise.all([source.get(), source.get(), source.get()]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the bundled copy and waits before trying again", async () => {
    global.fetch = jest.fn(async () => new Response("not found", { status: 404 }));
    const source = createAdapterManifestSource({
      authServerUrl: "https://auth.test",
      retryAfterMs: 60_000,
    });

    await expect(source.get()).resolves.toBe(BUNDLED_ADAPTER_MANIFEST);
    await expect(source.get()).resolves.toBe(BUNDLED_ADAPTER_MANIFEST);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries after the wait", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(Response.json(manifest));
    const source = createAdapterManifestSource({
      authServerUrl: "https://auth.test",
      retryAfterMs: 0,
    });

    await expect(source.get()).resolves.toBe(BUNDLED_ADAPTER_MANIFEST);
    await expect(source.get()).resolves.toEqual(manifest);
  });

  it("falls back when the fetched manifest is not one it can follow", async () => {
    global.fetch = jest.fn(async () => Response.json({ ...manifest, schemaVersion: 2 }));
    const source = createAdapterManifestSource({ authServerUrl: "https://auth.test" });

    await expect(source.get()).resolves.toBe(BUNDLED_ADAPTER_MANIFEST);
  });

  it("gives up on a fetch that does not answer in time", async () => {
    global.fetch = jest.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason));
        }),
    );
    const source = createAdapterManifestSource({
      authServerUrl: "https://auth.test",
      timeoutMs: 10,
    });

    await expect(source.get()).resolves.toBe(BUNDLED_ADAPTER_MANIFEST);
  });

  it("never fetches when fetching is turned off", async () => {
    global.fetch = jest.fn();
    const source = createAdapterManifestSource({
      authServerUrl: "https://auth.test",
      fetchManifest: false,
    });

    await expect(source.get()).resolves.toBe(BUNDLED_ADAPTER_MANIFEST);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
