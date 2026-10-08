import { jest } from "@jest/globals";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("requestOtpHandler", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: "sent" }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uses registration OTP endpoints by default", async () => {
    const { requestOtpHandler } = await import(
      "../dist/handlers/requestOtpHandler.js"
    );

    await requestOtpHandler(
      { kind: "email", authorization: "Bearer service-token" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/otp/generate-email-otp",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("uses login OTP endpoints when requested", async () => {
    const { requestOtpHandler } = await import(
      "../dist/handlers/requestOtpHandler.js"
    );

    await requestOtpHandler(
      {
        kind: "phone",
        flow: "login",
        authorization: "Bearer service-token",
      },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.example.com/otp/generate-login-phone-otp",
      expect.objectContaining({ method: "GET" }),
    );
  });

  // The auth API re-mints the caller's ephemeral token on every send. The cookie
  // already holds one, and page scripts must not be able to read it (#202).
  it("drops the re-minted token from the body by default", async () => {
    const { requestOtpHandler } = await import(
      "../dist/handlers/requestOtpHandler.js"
    );
    global.fetch.mockResolvedValue(
      jsonResponse(200, { message: "success", token: "re-minted" }),
    );

    const result = await requestOtpHandler(
      { kind: "email", flow: "login", authorization: "Bearer pre-auth" },
      { authServerUrl: "https://auth.example.com", transport: "cookie" },
    );

    expect(result.body).toEqual({ message: "success" });
  });

  it("drops it when no transport is given", async () => {
    const { requestOtpHandler } = await import(
      "../dist/handlers/requestOtpHandler.js"
    );
    global.fetch.mockResolvedValue(
      jsonResponse(200, { message: "success", token: "re-minted" }),
    );

    const result = await requestOtpHandler(
      { kind: "email", authorization: "Bearer pre-auth" },
      { authServerUrl: "https://auth.example.com" },
    );

    expect(result.body).toEqual({ message: "success" });
  });

  it("keeps it for a bearer client, which holds its own token", async () => {
    const { requestOtpHandler } = await import(
      "../dist/handlers/requestOtpHandler.js"
    );
    global.fetch.mockResolvedValue(
      jsonResponse(200, { message: "success", token: "re-minted" }),
    );

    const result = await requestOtpHandler(
      { kind: "email", flow: "login", authorization: "Bearer pre-auth" },
      { authServerUrl: "https://auth.example.com", transport: "bearer" },
    );

    expect(result.body).toEqual({ message: "success", token: "re-minted" });
  });

  it("keeps the delivery payload for the adapter to send", async () => {
    const { requestOtpHandler } = await import(
      "../dist/handlers/requestOtpHandler.js"
    );
    const delivery = { kind: "otp_email", to: "a@b.c", token: "123456" };
    global.fetch.mockResolvedValue(
      jsonResponse(200, { message: "success", token: "re-minted", delivery }),
    );

    const result = await requestOtpHandler(
      { kind: "email", authorization: "Bearer pre-auth" },
      { authServerUrl: "https://auth.example.com", externalDelivery: true },
    );

    expect(result.body).toEqual({ message: "success", delivery });
  });
});
