import { describe, expect, it } from "vitest";
import { errorMessageFromBody } from "../src/api/errorMessage";
import { freshness, periodTitle, PERIODS } from "../src/lib/leaderboard";

const now = new Date("2026-10-01T12:00:00Z");

describe("freshness", () => {
  it("marks never-synced and old members stale", () => {
    expect(freshness(null, now)).toEqual({ text: "never synced", stale: true });
    expect(freshness("2026-10-01T11:55:00Z", now)).toEqual({ text: "updated 5 min ago", stale: false });
    expect(freshness("2026-10-01T09:00:00Z", now)).toEqual({ text: "updated 3 h ago", stale: true });
  });

  it("lists the four periods", () => {
    expect(PERIODS.map((p) => p.value)).toEqual(["today", "week", "month", "quarter"]);
    expect(periodTitle("quarter")).toBe("3 Months");
  });
});

describe("errorMessageFromBody", () => {
  it("reads NestJS error bodies", () => {
    expect(errorMessageFromBody({ statusCode: 404, message: "Demo mode is off" }, "x")).toBe("Demo mode is off");
    expect(errorMessageFromBody({ message: ["a", "b"] }, "x")).toBe("a, b");
    expect(errorMessageFromBody(null, "fallback")).toBe("fallback");
  });
});
