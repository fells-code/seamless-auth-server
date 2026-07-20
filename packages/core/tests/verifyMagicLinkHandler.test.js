import { jest } from "@jest/globals";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("verifyMagicLinkHandler", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: "verified" }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("encodes the token into a single upstream path segment", async () => {
    const { verifyMagicLinkHandler } = await import(
      "../dist/handlers/verifyMagicLinkHandler.js"
    );

    await verifyMagicLinkHandler(
      { token: "abc123" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link/verify/abc123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps a traversal-shaped token confined to one path segment", async () => {
    const { verifyMagicLinkHandler } = await import(
      "../dist/handlers/verifyMagicLinkHandler.js"
    );

    await verifyMagicLinkHandler(
      { token: "../../admin/users" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link/verify/..%2F..%2Fadmin%2Fusers",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps a query-injecting token confined to one path segment", async () => {
    const { verifyMagicLinkHandler } = await import(
      "../dist/handlers/verifyMagicLinkHandler.js"
    );

    await verifyMagicLinkHandler(
      { token: "x?admin=1" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/magic-link/verify/x%3Fadmin%3D1",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
