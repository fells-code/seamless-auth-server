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

  const REGISTERED = {
    message: "Success",
    sub: "user-123",
    token: "ephemeral-token",
    ttl: 300,
  };

  // The cookie holds the registration token. Returning it in the body as well
  // let page scripts read the token the httpOnly cookie exists to hide (#202).
  it("keeps the registration token out of a cookie-transport body", async () => {
    const { registerHandler } = await import("../dist/handlers/register.js");
    global.fetch.mockResolvedValue(createJsonResponse(200, REGISTERED));

    const result = await registerHandler(
      { body: { email: "user@example.com" } },
      {
        authServerUrl: "https://auth.example.com",
        registrationCookieName: "registration",
      },
    );

    expect(result.body).toEqual({ message: "Success", sub: "user-123", ttl: 300 });
    expect(result.setCookies[0].value.token).toBe("ephemeral-token");
  });

  it("returns the whole body in bearer transport", async () => {
    const { registerHandler } = await import("../dist/handlers/register.js");
    global.fetch.mockResolvedValue(createJsonResponse(200, REGISTERED));

    const result = await registerHandler(
      { body: { email: "user@example.com" } },
      {
        authServerUrl: "https://auth.example.com",
        registrationCookieName: "registration",
        transport: "bearer",
      },
    );

    expect(result.body).toEqual(REGISTERED);
    expect(result.setCookies).toBeUndefined();
  });
});
