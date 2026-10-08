import jwt from "jsonwebtoken";

const { authenticateCookie } = await import("../dist/guards.js");

const COOKIE_SECRET = "cookie-secret-cookie-secret-cookie-secret";

const apiToken = (typ) => jwt.sign({ sub: "user-1", typ }, "upstream-signing-key");
const cookie = (payload) => jwt.sign(payload, COOKIE_SECRET, { expiresIn: "300s" });

// Every adapter cookie is signed with the same secret, and /login hands out a
// pre-auth cookie for any existing account from its email address alone. Only an
// access token inside the cookie makes it a session.
describe("authenticateCookie only accepts a session cookie", () => {
  it("accepts a cookie carrying an access token", () => {
    const token = apiToken("access");
    const { user } = authenticateCookie({
      token: cookie({ sub: "user-1", token }),
      cookieSecret: COOKIE_SECRET,
    });

    expect(user).toMatchObject({ id: "user-1", token });
  });

  it.each([
    ["the pre-auth or registration cookie", { sub: "user-1", token: apiToken("ephemeral") }],
    ["the refresh cookie", { sub: "user-1", refreshToken: "opaque" }],
    ["a cookie whose token is not a JWT", { sub: "user-1", token: "opaque" }],
    ["a cookie whose token has no type", { sub: "user-1", token: apiToken(undefined) }],
  ])("refuses %s", (_label, payload) => {
    const result = authenticateCookie({ token: cookie(payload), cookieSecret: COOKIE_SECRET });

    expect(result.user).toBeUndefined();
    expect(result.rejection).toMatchObject({ status: 401 });
  });
});
