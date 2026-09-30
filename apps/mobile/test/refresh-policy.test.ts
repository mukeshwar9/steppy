import { describe, expect, it } from "vitest";
import { afterRefreshRejection, authRetryDelay, isRefreshRejection } from "../src/api/refreshPolicy";

describe("isRefreshRejection", () => {
  it("only 400, 401 and 403 reject the token", () => {
    for (const status of [400, 401, 403]) expect(isRefreshRejection(status)).toBe(true);
  });
  it("network errors, 429, 5xx and other 4xx keep the session", () => {
    for (const status of [0, 404, 408, 409, 422, 429, 500, 502, 503]) expect(isRefreshRejection(status)).toBe(false);
  });
});

describe("afterRefreshRejection", () => {
  it("adopts a newer refresh token rotated by another context", () => {
    expect(afterRefreshRejection({ usedRefreshToken: "old", stored: { refreshToken: "new" } })).toBe("adopt-stored");
  });
  it("clears the session when the rejected token is still the stored one", () => {
    expect(afterRefreshRejection({ usedRefreshToken: "same", stored: { refreshToken: "same" } })).toBe("clear-session");
  });
  it("clears the session when nothing is stored any more", () => {
    expect(afterRefreshRejection({ usedRefreshToken: "t", stored: null })).toBe("clear-session");
  });
  it("keeps the session when the keychain cannot be read", () => {
    expect(afterRefreshRejection({ usedRefreshToken: "t", stored: "error" })).toBe("keep-session");
  });
});

describe("authRetryDelay", () => {
  it("waits out the throttle window on the first failure", () => {
    expect(authRetryDelay(0, 2_000)).toBe(8_000);
    expect(authRetryDelay(0, 20_000)).toBe(0);
  });
  it("backs off with consecutive failures, capped at 60 s", () => {
    expect(authRetryDelay(1, 20_000)).toBe(5_000);
    expect(authRetryDelay(3, 20_000)).toBe(20_000);
    expect(authRetryDelay(10, 0)).toBe(60_000);
  });
});
