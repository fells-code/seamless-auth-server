import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";

import {
  authorizePermissions,
  authorizeRoles,
  createResourceServer,
  INSUFFICIENT_PERMISSION,
  permissionRequirement,
  PERMISSIONS_UNAVAILABLE,
  setSeamlessLogger,
} from "../dist/index.js";

const vectors = JSON.parse(
  readFileSync(new URL("./fixtures/verify-only/vectors.json", import.meta.url)),
);

const user = (claims = {}) => ({ id: "user-1", roles: [], ...claims });

describe("authorizePermissions", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setSeamlessLogger({ warn: () => {}, error: () => {} });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("names the codes the contract does", () => {
    expect(INSUFFICIENT_PERMISSION).toBe("insufficient_permission");
    expect(PERMISSIONS_UNAVAILABLE).toBe("permissions_unavailable");
  });

  it("answers 401 with no user", async () => {
    await expect(authorizePermissions(undefined, "a:read")).resolves.toEqual({
      status: 401,
      errorCode: "unauthenticated",
    });
  });

  it("refuses a user no token was read for, rather than failing", async () => {
    await expect(authorizePermissions(user(), "a:read")).resolves.toEqual({
      status: 403,
      errorCode: INSUFFICIENT_PERMISSION,
    });
  });

  it("reads the organization from the token a cookie-only guard left it in", async () => {
    const token = `e30.${Buffer.from(JSON.stringify({ org_id: "org-a" })).toString("base64url")}.sig`;

    await expect(
      authorizePermissions(
        user({ token, organizationPermissions: ["a:read"] }),
        "a:read",
        { organization: true },
      ),
    ).resolves.toBeUndefined();
  });

  it("answers 503 for an omitted session with no token to read with", async () => {
    const rejection = await authorizePermissions(
      user({ permissionsOmitted: true }),
      "a:read",
      { authServerUrl: "https://auth.example.com" },
    );

    expect(rejection).toMatchObject({
      status: 503,
      errorCode: PERMISSIONS_UNAVAILABLE,
    });
  });

  it("prefers the configured URL and reads nothing from the token", async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            permissions: ["a:read"],
            organizationId: null,
            organizationPermissions: [],
          }),
        ),
    );
    global.fetch = fetchMock;
    const token = `e30.${Buffer.from(JSON.stringify({ iss: "https://evil.example.com", authServerUrl: "https://evil.example.com" })).toString("base64url")}.sig`;

    await authorizePermissions(user({ token, permissionsOmitted: true }), "a:read", {
      authServerUrl: "https://auth.example.com",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://auth.example.com/users/me/permissions",
    );
  });
});

describe("authorizeRoles", () => {
  it("does not count organization roles", () => {
    expect(
      authorizeRoles(user({ organizationRoles: ["admin"] }), "admin"),
    ).toMatchObject({ status: 403, errorCode: "insufficient_role" });
  });
});

describe("permissionRequirement", () => {
  it("binds whenever a parameter is named, even with organization off", () => {
    expect(
      permissionRequirement(
        { organization: false, organizationParam: "id" },
        { id: "org-a" },
      ).organization,
    ).toEqual({ routeValue: "org-a" });
  });

  it.each([[["a", "b"]], [7], [undefined]])(
    "reads a parameter of %j as missing",
    (value) => {
      expect(
        permissionRequirement({ organizationParam: "id" }, { id: value })
          .organization,
      ).toEqual({ routeValue: undefined });
    },
  );

  it("reads missing params as a missing parameter", () => {
    expect(
      permissionRequirement({ organizationParam: "id" }, undefined).organization,
    ).toEqual({ routeValue: undefined });
  });
});

describe("the resource server's authorizePermissions", () => {
  const verifier = createResourceServer({
    issuer: vectors.issuer,
    audience: vectors.audience,
    jwks: vectors.jwks,
  });

  it("answers its own 401 with no user", () => {
    expect(verifier.authorizePermissions(undefined, "a:read")).toMatchObject({
      status: 401,
      errorCode: "missing_token",
    });
  });

  it("does not throw on an empty list", () => {
    expect(
      verifier.authorizePermissions(user({ permissions: ["a:read"] }), []),
    ).toMatchObject({ status: 403, errorCode: INSUFFICIENT_PERMISSION });
  });

  it("uses the token's orgId for organization scope", () => {
    expect(
      verifier.authorizePermissions(
        user({ orgId: "org-a", organizationPermissions: ["a:read"] }),
        "a:read",
        { organization: { routeValue: "org-a" } },
      ),
    ).toBeUndefined();
  });
});
