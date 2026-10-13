// Type-checks a consumer against the built dist, with skipLibCheck off so an
// unresolvable import inside the shipped declarations fails here. The fixture's
// @ts-expect-error lines fail too if an export degrades to `any`.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
const fixture = fileURLToPath(new URL("./types/consumer.ts", import.meta.url));

const RESOLUTIONS = [
  { module: "ESNext", moduleResolution: "bundler" },
  { module: "NodeNext", moduleResolution: "NodeNext" },
];

describe("@seamless-auth/express consumer types", () => {
  it.each(RESOLUTIONS)(
    "types req.user and req.cookiePayload under moduleResolution $moduleResolution",
    ({ module, moduleResolution }) => {
      let output = "";
      try {
        execFileSync(
          process.execPath,
          [
            tsc,
            "--noEmit",
            "--strict",
            "--skipLibCheck",
            "false",
            "--target",
            "ES2022",
            "--module",
            module,
            "--moduleResolution",
            moduleResolution,
            fixture,
          ],
          { encoding: "utf8", stdio: "pipe" },
        );
      } catch (err) {
        output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      }
      expect(output).toBe("");
    },
    60000,
  );
});
