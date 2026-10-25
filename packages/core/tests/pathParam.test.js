import { jest } from "@jest/globals";

const authFetchMock = jest.fn();

jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
}));

const {
  encodePathParam,
  InvalidPathParamError,
  revokeSessionHandler,
  updateUserHandler,
  verifyMagicLinkHandler,
} = await import("../dist/index.js");

describe("encodePathParam", () => {
  it.each(["", ".", ".."])("refuses %j", (value) => {
    expect(() => encodePathParam(value, "id")).toThrow(InvalidPathParamError);

    try {
      encodePathParam(value, "id");
    } catch (error) {
      expect(error.status).toBe(400);
    }
  });

  it.each([
    ["abc", "abc"],
    ["a..b", "a..b"],
    ["...", "..."],
    ["a/b", "a%2Fb"],
    ["x?y=1", "x%3Fy%3D1"],
  ])("encodes %j as one segment", (value, encoded) => {
    expect(encodePathParam(value)).toBe(encoded);
  });
});

describe("core handlers refuse dot-segment params", () => {
  beforeEach(() => authFetchMock.mockReset());

  it.each([
    ["revokeSessionHandler", async () => revokeSessionHandler("..", { authServerUrl: "https://a" })],
    ["updateUserHandler", async () => updateUserHandler(".", { authServerUrl: "https://a" })],
    [
      "verifyMagicLinkHandler",
      () => verifyMagicLinkHandler({ token: ".." }, { authServerUrl: "https://a" }),
    ],
  ])("%s", async (_name, run) => {
    await expect(run()).rejects.toBeInstanceOf(InvalidPathParamError);
    expect(authFetchMock).not.toHaveBeenCalled();
  });
});
