import jwt from "jsonwebtoken";
import { verifyCookieJwt } from "../dist/verifyCookieJwt.js";

describe("verifyCookieJwt", () => {
  const secret = "test-secret";

  it("returns payload for valid JWT", () => {
    const token = jwt.sign({ sub: "user-123", roles: ["admin"] }, secret, {
      expiresIn: "1h",
    });

    const payload = verifyCookieJwt(token, secret);

    expect(payload).not.toBeNull();
    expect(payload.sub).toBe("user-123");
    expect(payload.roles).toEqual(["admin"]);
  });

  it("returns null for invalid JWT", () => {
    const payload = verifyCookieJwt("not-a-jwt", secret);
    expect(payload).toBeNull();
  });

  it("returns null when signed with wrong secret", () => {
    const token = jwt.sign({ sub: "user-123" }, "wrong-secret", {
      expiresIn: "1h",
    });

    const payload = verifyCookieJwt(token, secret);
    expect(payload).toBeNull();
  });
});
