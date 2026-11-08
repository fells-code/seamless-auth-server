import { jest } from "@jest/globals";

const actual = await import("node:crypto");
const timingSafeEqual = jest.fn(actual.timingSafeEqual);
jest.unstable_mockModule("node:crypto", () => ({
  ...actual,
  default: actual,
  timingSafeEqual,
}));

const { verifyWebhook } = await import("../dist/webhook.js");

const SECRET_A = "whsec_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=";
const SECRET_B = "whsec_ZWZnaGlqa2xtbm9wcXJzdHV2d3h5ent8fX5/gIGCg4Q=";
const BODY =
  '{"id":"evt_01","type":"user.created","version":1,"timestamp":"2026-01-01T00:00:00.000Z","data":{"userId":"user_01","email":"ada@example.com","phone":null}}';
const HEADERS = {
  "webhook-id": "evt_01",
  "webhook-timestamp": "1767225600",
  "webhook-signature":
    "v1,2Wdjh1HKOsFxwMrIhCkeI9af2ld08BNRpv8fuepQbhg= v1,s6HpmlDOYZalhTpS1nV7JQMhqmAhCh46dQzUOnTdoZE=",
};

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(1767225600 * 1000);
  timingSafeEqual.mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe("verifyWebhook comparison", () => {
  it("compares in constant time against every secret and signature", () => {
    // The first pair already matches; all four are still compared, so timing
    // does not reveal which secret or entry verified.
    verifyWebhook(BODY, HEADERS, { secret: [SECRET_A, SECRET_B] });
    expect(timingSafeEqual).toHaveBeenCalledTimes(4);
  });
});
