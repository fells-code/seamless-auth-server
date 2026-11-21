import { checkContentType, checkOrigin } from "../dist/index.js";

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

    // An opaque origin is never the adopter's own page, whatever else the
    // request says.
    it.each(["same-origin", "same-site", "none", "cross-site"])(
      "refuses a literal null Origin with Sec-Fetch-Site %s",
      (secFetchSite) => {
        expect(check({ secFetchSite, origin: "null" })).toEqual(BLOCKED);
        expect(
          check({ secFetchSite, origin: "null", allowedOrigins: ["null", LISTED] }),
        ).toEqual(BLOCKED);
      },
    );

    it("refuses a literal null Origin even when allowedOrigins lists it", () => {
      expect(check({ origin: "null", allowedOrigins: ["null"] })).toEqual(BLOCKED);
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

    // Without allowedOrigins the Origin must name the request's Host (#283).
    describe("without allowedOrigins", () => {
      const HOST = "app.example.com";

      it.each([undefined, "same-site", "none"])(
        "refuses a sibling Origin with Sec-Fetch-Site %s",
        (secFetchSite) => {
          expect(check({ secFetchSite, origin: SIBLING, host: HOST })).toEqual(BLOCKED);
        },
      );

      it.each([undefined, "same-site", "none", "SAME-SITE"])(
        "accepts the Host's own Origin with Sec-Fetch-Site %s",
        (secFetchSite) => {
          expect(check({ secFetchSite, origin: LISTED, host: HOST })).toBeUndefined();
        },
      );

      it("refuses a same-site request with no Origin", () => {
        expect(check({ secFetchSite: "same-site", host: HOST })).toEqual(BLOCKED);
      });

      it("refuses an Origin when the Host is unknown", () => {
        expect(check({ origin: LISTED })).toEqual(BLOCKED);
        expect(check({ origin: LISTED, host: "" })).toEqual(BLOCKED);
      });

      it("matches the port, spelled out or left as the default", () => {
        expect(check({ origin: LISTED, host: "app.example.com:443" })).toBeUndefined();
        expect(
          check({ origin: "http://app.example.com", host: "app.example.com:80" }),
        ).toBeUndefined();
        expect(
          check({ origin: "http://localhost:3000", host: "localhost:3000" }),
        ).toBeUndefined();
        expect(check({ origin: "http://localhost:3000", host: "localhost" })).toEqual(
          BLOCKED,
        );
        expect(check({ origin: LISTED, host: "app.example.com:8443" })).toEqual(BLOCKED);
      });

      it("ignores case and refuses an Origin that does not parse", () => {
        expect(
          check({ origin: "https://APP.example.com", host: "App.Example.com" }),
        ).toBeUndefined();
        expect(check({ origin: "not a url", host: HOST })).toEqual(BLOCKED);
      });

      it("prefers allowedOrigins over the Host when both are set", () => {
        expect(
          check({ origin: LISTED, host: HOST, allowedOrigins: [SIBLING] }),
        ).toEqual(BLOCKED);
        expect(
          check({ origin: SIBLING, host: HOST, allowedOrigins: [SIBLING] }),
        ).toBeUndefined();
      });
    });

    it.each(["same-planet", "", "cross-site, same-origin"])(
      "refuses a Sec-Fetch-Site value the spec does not define (%j)",
      (secFetchSite) => {
        expect(
          check({ secFetchSite, origin: LISTED, host: "app.example.com" }),
        ).toEqual(BLOCKED);
      },
    );

    it("accepts a same-origin request with no Host", () => {
      expect(check({ secFetchSite: "same-origin", origin: SIBLING })).toBeUndefined();
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

describe("checkContentType", () => {
  const REFUSED = { status: 415, errorCode: "unsupported_media_type" };

  it.each([
    ["POST", "application/x-www-form-urlencoded"],
    ["POST", "multipart/form-data; boundary=x"],
    ["POST", "text/plain"],
    ["POST", undefined],
    ["POST", "application/json-seq"],
    ["DELETE", undefined],
    ["PUT", "text/plain"],
    ["PATCH", undefined],
  ])("refuses %s with Content-Type %s", (method, contentType) => {
    expect(checkContentType({ method, path: "/recovery-codes", contentType })).toEqual(
      REFUSED,
    );
  });

  it.each([
    "application/json",
    "Application/JSON; charset=utf-8",
    " application/json ",
  ])("accepts Content-Type %s with or without a body", (contentType) => {
    expect(
      checkContentType({ method: "POST", path: "/recovery-codes", contentType }),
    ).toBeUndefined();
  });

  it.each(["bearer", "cookie", ""])(
    "accepts any x-seamless-auth-transport value (%j)",
    (transport) => {
      expect(
        checkContentType({ method: "POST", path: "/recovery-codes", transport }),
      ).toBeUndefined();
    },
  );

  it("leaves safe methods alone", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(checkContentType({ method, path: "/recovery-codes" })).toBeUndefined();
    }
  });

  it.each([
    ["POST", "/refresh"],
    ["POST", "/Refresh/"],
    ["DELETE", "/logout"],
    ["DELETE", "/logout/all"],
  ])("exempts %s %s, which the browser client sends bare", (method, path) => {
    expect(checkContentType({ method, path })).toBeUndefined();
  });

  it.each([
    ["POST", "/logout"],
    ["DELETE", "/refresh"],
    ["POST", "/refresh/extra"],
    ["DELETE", "/logout/everything"],
  ])("does not stretch the exemption to %s %s", (method, path) => {
    expect(checkContentType({ method, path })).toEqual(REFUSED);
  });
});
