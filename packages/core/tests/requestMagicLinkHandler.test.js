import { jest } from "@jest/globals";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function load() {
  const { requestMagicLinkHandler } = await import(
    "../dist/handlers/requestMagicLinkHandler.js"
  );

  return requestMagicLinkHandler;
}

function requestedUrl() {
  return global.fetch.mock.calls[0][0];
}

describe("requestMagicLinkHandler", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: "sent" }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("asks for the tenant default when no target is given", async () => {
    const requestMagicLinkHandler = await load();

    await requestMagicLinkHandler(
      {},
      { authServerUrl: "https://auth.example.com" },
    );

    expect(requestedUrl()).toBe("https://auth.example.com/magic-link");
  });

  it("forwards a requested target as a query parameter", async () => {
    const requestMagicLinkHandler = await load();

    await requestMagicLinkHandler(
      { redirectUri: "https://app.example.com/magic" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(requestedUrl()).toBe(
      "https://auth.example.com/magic-link?redirectUri=https%3A%2F%2Fapp.example.com%2Fmagic",
    );
  });

  it("encodes a target that carries its own query", async () => {
    const requestMagicLinkHandler = await load();

    await requestMagicLinkHandler(
      { redirectUri: "https://app.example.com/magic?platform=ios" },
      { authServerUrl: "https://auth.example.com" },
    );

    const url = new URL(requestedUrl());

    expect(url.searchParams.get("redirectUri")).toBe(
      "https://app.example.com/magic?platform=ios",
    );
  });

  /**
   * The API is the only allowlist. Forwarding rather than judging keeps one place
   * where a redirect is approved, so this asserts the refusal is passed back rather
   * than that the adapter blocked it.
   */
  it("passes an upstream refusal back to the caller", async () => {
    const requestMagicLinkHandler = await load();

    global.fetch.mockResolvedValue(
      jsonResponse(400, { error: "Redirect URI is not allowed" }),
    );

    const result = await requestMagicLinkHandler(
      { redirectUri: "https://evil.example/steal" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(result.status).toBe(400);
    expect(result.errorBody).toBeDefined();
  });
});
