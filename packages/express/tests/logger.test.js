import { jest } from "@jest/globals";

const { createSeamlessAuthServer, setSeamlessLogger } = await import(
  "../dist/index.js"
);

describe("setSeamlessLogger (express)", () => {
  afterEach(() => {
    setSeamlessLogger();
    jest.restoreAllMocks();
  });

  it("receives the adapter's own warnings instead of console", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const logger = { warn: jest.fn(), error: jest.fn() };
    setSeamlessLogger(logger);

    createSeamlessAuthServer({
      fetchManifest: false,
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[SEAMLESS-AUTH-EXPRESS\] - jwksKid is not set/),
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
