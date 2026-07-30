// A passthrough route forwards the auth API's failure body rather than
// interpreting it. The one case it cannot forward is an empty body, which used
// to produce a bare status with nothing in it (#125).
const { readPassthroughFailure, UPSTREAM_ERROR_CODE } = await import(
  "../dist/upstreamError.js"
);

describe("readPassthroughFailure", () => {
  it.each([
    ["a coded body", { error: "account_locked" }],
    [
      "an OAuth body with a sibling code",
      { error: "oauth_profile_error", code: "oauth_email_not_verified" },
    ],
    ["a validation body", { name: "ZodError", message: "bad" }],
    ["a message-only body", { message: "Too many requests." }],
  ])("forwards %s untouched", (_label, body) => {
    expect(readPassthroughFailure(body)).toEqual({ errorBody: body });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a bare string", "nope"],
    ["a number", 0],
  ])("falls back to a code for %s", (_label, body) => {
    expect(readPassthroughFailure(body)).toEqual({
      errorCode: UPSTREAM_ERROR_CODE,
    });
  });

  it("accepts a caller-supplied fallback", () => {
    expect(readPassthroughFailure(undefined, "login_unavailable")).toEqual({
      errorCode: "login_unavailable",
    });
  });

  it("never returns both a body and a code", () => {
    for (const body of [undefined, null, {}, { error: "x" }, "s"]) {
      const result = readPassthroughFailure(body);
      expect(
        result.errorBody === undefined || result.errorCode === undefined,
      ).toBe(true);
    }
  });
});
