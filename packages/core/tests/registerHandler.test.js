import { jest } from "@jest/globals";

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("registerHandler", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("stores the upstream ephemeral token in the registration cookie", async () => {
    const { registerHandler } = await import("../dist/handlers/register.js");

    global.fetch.mockResolvedValue(
      createJsonResponse(200, {
        message: "Success",
        sub: "user-123",
        token: "ephemeral-token",
        ttl: 300,
      }),
    );

    const result = await registerHandler(
      {
        body: { email: "user@example.com", phone: "+14155552671" },
      },
      {
        authServerUrl: "https://auth.example.com",
        registrationCookieName: "registration",
      },
    );

    expect(result.status).toBe(200);
    expect(result.setCookies).toEqual([
      {
        name: "registration",
        value: { sub: "user-123", token: "ephemeral-token" },
        ttl: 300,
        domain: undefined,
      },
    ]);
  });
});
