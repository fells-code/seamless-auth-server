import { jest } from "@jest/globals";

const authFetchMock = jest.fn();

jest.unstable_mockModule("../dist/authFetch.js", () => ({
  authFetch: authFetchMock,
}));

const baseOptions = {
  authServerUrl: "https://auth.example.com",
  authorization: "Bearer service-token",
  forwardedClientIp: "203.0.113.44",
};

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("admin handlers", () => {
  beforeEach(() => authFetchMock.mockReset());

  it("forwards the delete user request body", async () => {
    const { deleteUserHandler } = await import("../dist/handlers/admin.js");

    authFetchMock.mockResolvedValue(
      createJsonResponse(200, { message: "Success" }),
    );

    const result = await deleteUserHandler({
      ...baseOptions,
      body: { userId: "user-1" },
    });

    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.example.com/admin/users",
      {
        method: "DELETE",
        authorization: "Bearer service-token",
        body: { userId: "user-1" },
        forwardedClientIp: "203.0.113.44",
      },
    );
    expect(result).toEqual({
      status: 200,
      body: { message: "Success" },
    });
  });

  it("keeps an injected user id in a single path segment (#65)", async () => {
    const { getUserDetailHandler } = await import("../dist/handlers/admin.js");

    authFetchMock.mockResolvedValue(createJsonResponse(200, { user: null }));

    await getUserDetailHandler("../sessions?all=true", baseOptions);

    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.example.com/admin/users/..%2Fsessions%3Fall%3Dtrue",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps an injected session id in a single path segment (#65)", async () => {
    const { revokeSessionHandler } = await import(
      "../dist/handlers/sessions.js"
    );

    authFetchMock.mockResolvedValue(createJsonResponse(200, { ok: true }));

    await revokeSessionHandler("abc#frag/../../admin", baseOptions);

    expect(authFetchMock).toHaveBeenCalledWith(
      "https://auth.example.com/sessions/abc%23frag%2F..%2F..%2Fadmin",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
