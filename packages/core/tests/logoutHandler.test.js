import { jest } from "@jest/globals";

const authFetchMock = jest.fn();

jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
}));

const baseOptions = {
  authServerUrl: "https://auth.example.com",
  accessCookieName: "access",
  registrationCookieName: "registration",
  refreshCookieName: "refresh",
  authorization: "Bearer service-token",
  forwardedClientIp: "203.0.113.44",
};

describe("logoutHandler", () => {
  beforeEach(() => authFetchMock.mockReset());

  it("logs out all sessions by default for backward compatibility", async () => {
    const { logoutHandler } = await import("../dist/handlers/logout.js");

    authFetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await logoutHandler(baseOptions);

    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.example.com/logout/all",
      {
        method: "DELETE",
        authorization: "Bearer service-token",
        forwardedClientIp: "203.0.113.44",
      },
    );
    expect(result).toEqual({
      status: 204,
      clearCookies: ["access", "registration", "refresh"],
    });
  });

  it("can log out only the current session", async () => {
    const { logoutCurrentSessionHandler } = await import(
      "../dist/handlers/logout.js"
    );

    authFetchMock.mockResolvedValue({ ok: true, status: 200 });

    await logoutCurrentSessionHandler(baseOptions);

    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.example.com/logout",
      expect.objectContaining({
        method: "DELETE",
        authorization: "Bearer service-token",
      }),
    );
  });
});
