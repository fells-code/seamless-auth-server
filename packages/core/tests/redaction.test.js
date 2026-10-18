import { describe, expect, it } from "@jest/globals";
import { redactSensitiveText } from "../dist/redaction.js";

describe("redaction", () => {
  it("redacts tokens and OAuth values embedded in URLs", () => {
    expect(
      redactSensitiveText(
        "/magic-link/verify/abc123?bootstrapToken=secret&code=oauth-code&salt=prf-salt",
      ),
    ).toBe(
      "/magic-link/verify/[REDACTED]?bootstrapToken=[REDACTED]&code=[REDACTED]&salt=[REDACTED]",
    );
  });

  it("redacts the token in the magic link confirm path", () => {
    expect(redactSensitiveText("POST /magic-link/verify/abc123/confirm")).toBe(
      "POST /magic-link/verify/[REDACTED]/confirm",
    );
  });
});
