import jwt from "jsonwebtoken";

const { verifyRefreshCookie } = await import("../dist/verifyRefreshCookie.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

const apiToken = (typ) => jwt.sign({ sub: "user-1", typ }, "upstream-signing-key");
const cookie = (payload, secret = COOKIE_SECRET) =>
  jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: "300s" });

// Every adapter cookie is signed with the same secret, so a pre-auth cookie from
// /login must not pass for a refresh cookie.
describe("verifyRefreshCookie only accepts a refresh cookie", () => {
  it("accepts a cookie carrying a refresh token", () => {
    expect(
      verifyRefreshCookie(cookie({ sub: "user-1", refreshToken: "opaque" }), COOKIE_SECRET),
    ).toMatchObject({ sub: "user-1", refreshToken: "opaque" });
  });

  it.each([
    ["the pre-auth or registration cookie", { sub: "user-1", token: apiToken("ephemeral") }],
    ["the access cookie", { sub: "user-1", token: apiToken("access"), roles: [] }],
    [
      "a cookie carrying both tokens",
      { sub: "user-1", token: apiToken("access"), refreshToken: "opaque" },
    ],
    ["a cookie with an empty refresh token", { sub: "user-1", refreshToken: "" }],
    ["a cookie whose refresh token is not a string", { sub: "user-1", refreshToken: 1 }],
    ["a cookie without a subject", { refreshToken: "opaque" }],
  ])("refuses %s", (_label, payload) => {
    expect(verifyRefreshCookie(cookie(payload), COOKIE_SECRET)).toBeNull();
  });

  it("refuses a cookie signed with another secret", () => {
    expect(
      verifyRefreshCookie(
        cookie({ sub: "user-1", refreshToken: "opaque" }, "another-secret-another-secret-another"),
        COOKIE_SECRET,
      ),
    ).toBeNull();
  });
});
