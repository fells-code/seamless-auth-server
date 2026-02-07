import { jest } from "@jest/globals";

const authFetchMock = jest.fn();

jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
}));

describe("meHandler", () => {
  beforeEach(() => authFetchMock.mockReset());

  it("returns user and clears pre-auth cookie", async () => {
    const { meHandler } = await import("../dist/handlers/me.js");

    authFetchMock.mockResolvedValue({
      json: async () => ({ user: { id: "123" }, credentials: [] }),
    });

    const result = await meHandler({
      authServerUrl: "http://auth",
      preAuthCookieName: "pre-auth",
    });

    expect(result.status).toBe(200);
    expect(result.clearCookies).toContain("pre-auth");
  });
});
