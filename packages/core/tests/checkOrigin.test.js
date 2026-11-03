import { checkOrigin } from "../dist/index.js";

const BLOCKED = { status: 403, errorCode: "cross_site_request_blocked" };
const LISTED = "https://app.example.com";
const SIBLING = "https://sibling.example.com";

describe("checkOrigin", () => {
  // A Lax or Strict cookie still rides a same-site request, and a browser that
  // sends no fetch metadata gives no Sec-Fetch-Site to refuse on (#256).
  describe.each(["lax", "strict", "none"])("with SameSite=%s", (cookieSameSite) => {
    const check = (input) =>
      checkOrigin({ method: "POST", cookieSameSite, ...input });

    it("refuses a cross-site request", () => {
      expect(check({ secFetchSite: "cross-site" })).toEqual(BLOCKED);
    });

    it("refuses a literal null Origin without fetch metadata", () => {
      expect(check({ origin: "null" })).toEqual(BLOCKED);
    });

    it("refuses a same-site request from an Origin off allowedOrigins", () => {
      expect(
        check({ secFetchSite: "same-site", origin: SIBLING, allowedOrigins: [LISTED] }),
      ).toEqual(BLOCKED);
    });

    it("refuses a same-site request with no Origin when allowedOrigins is set", () => {
      expect(check({ secFetchSite: "same-site", allowedOrigins: [LISTED] })).toEqual(
        BLOCKED,
      );
    });

    it("refuses an Origin off allowedOrigins without fetch metadata", () => {
      expect(check({ origin: SIBLING, allowedOrigins: [LISTED] })).toEqual(BLOCKED);
    });

    it("treats an empty allowedOrigins as configured", () => {
      expect(
        check({ secFetchSite: "same-site", origin: LISTED, allowedOrigins: [] }),
      ).toEqual(BLOCKED);
      expect(check({ origin: LISTED, allowedOrigins: [] })).toEqual(BLOCKED);
    });

    it("accepts a same-site request from a listed Origin", () => {
      expect(
        check({ secFetchSite: "same-site", origin: LISTED, allowedOrigins: [LISTED] }),
      ).toBeUndefined();
    });

    it("accepts a same-origin request whatever the list says", () => {
      expect(
        check({ secFetchSite: "same-origin", origin: SIBLING, allowedOrigins: [] }),
      ).toBeUndefined();
    });

    it("accepts a caller with neither Origin nor Sec-Fetch-Site", () => {
      expect(check({ allowedOrigins: [LISTED] })).toBeUndefined();
    });

    it("leaves safe methods alone", () => {
      for (const method of ["GET", "HEAD", "OPTIONS"]) {
        expect(
          checkOrigin({ method, cookieSameSite, secFetchSite: "cross-site" }),
        ).toBeUndefined();
      }
    });
  });
});
