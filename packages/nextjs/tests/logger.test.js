import { jest } from "@jest/globals";

const { createSeamlessAuthHandler, setSeamlessLogger } = await import(
  "../dist/index.js"
);

describe("setSeamlessLogger (nextjs)", () => {
  afterEach(() => {
    setSeamlessLogger();
    jest.restoreAllMocks();
  });

  it("receives the adapter's own warnings instead of console", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const logger = { warn: jest.fn(), error: jest.fn() };
    setSeamlessLogger(logger);

    createSeamlessAuthHandler({
      fetchManifest: false,
      authServerUrl: "https://auth.example.com",
      cookieSecret: "cookie-secret-cookie-secret-cookie-secret",
      serviceSecret: "service-secret-service-secret-service-secret",
      audience: "https://auth.example.com",
      resolveClientIp: () => undefined,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[SEAMLESS-AUTH-NEXTJS\] - jwksKid is not set/),
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
