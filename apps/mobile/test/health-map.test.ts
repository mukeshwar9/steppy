import { describe, expect, it } from "vitest";
import { addDays, dateRange } from "@steppy/core";
import {
  healthConnectGroupsToTotals,
  healthKitBucketsToTotals,
  localMidnight,
  queryWindow,
  sanitizeSteps,
  toStepDays
} from "../src/health/map";
import { splitIntoSamples } from "../src/health/samples";

describe("toStepDays", () => {
  it("fills missing dates with 0, rounds, clamps and sorts", () => {
    const totals = new Map([
      ["2026-10-01", 1234.6],
      ["2026-09-30", -5],
      ["2026-09-29", 999_999]
    ]);
    expect(toStepDays(["2026-10-01", "2026-09-30", "2026-09-29", "2026-09-28"], totals)).toEqual([
      { date: "2026-09-28", steps: 0 },
      { date: "2026-09-29", steps: 200_000 },
      { date: "2026-09-30", steps: 0 },
      { date: "2026-10-01", steps: 1235 }
    ]);
    expect(sanitizeSteps(Number.NaN)).toBe(0);
    expect(sanitizeSteps(undefined)).toBe(0);
  });
});

describe("healthKitBucketsToTotals", () => {
  it("keys buckets by the local date of their start in the timezone", () => {
    // 2026-09-30T18:30Z is midnight 2026-10-01 in Kolkata.
    const totals = healthKitBucketsToTotals(
      [
        { startDate: new Date("2026-09-30T18:30:00Z"), sumQuantity: { quantity: 8000 } },
        { startDate: new Date("2026-10-01T18:30:00Z"), sumQuantity: { quantity: 500 } },
        { startDate: new Date("2026-10-02T18:30:00Z") },
        {}
      ],
      "Asia/Kolkata"
    );
    expect(totals.get("2026-10-01")).toBe(8000);
    expect(totals.get("2026-10-02")).toBe(500);
    expect(totals.get("2026-10-03")).toBe(0);
  });
});

describe("healthConnectGroupsToTotals", () => {
  it("uses the local date prefix of LocalDateTime start times", () => {
    const totals = healthConnectGroupsToTotals(
      [
        { startTime: "2026-09-30T00:00", result: { COUNT_TOTAL: 4321 } },
        { startTime: "2026-10-01T00:00", result: {} }
      ],
      "America/New_York"
    );
    expect(totals.get("2026-09-30")).toBe(4321);
    expect(totals.get("2026-10-01")).toBe(0);
  });

  it("converts instants with an offset into the timezone", () => {
    const totals = healthConnectGroupsToTotals(
      [{ startTime: "2026-09-30T18:30:00Z", result: { COUNT_TOTAL: 10 } }],
      "Asia/Kolkata"
    );
    expect(totals.get("2026-10-01")).toBe(10);
  });
});

describe("queryWindow", () => {
  it("covers first local midnight up to the midnight after the last day", () => {
    const w = queryWindow(["2026-09-29", "2026-09-30", "2026-10-01"]);
    expect(w.first).toBe("2026-09-29");
    expect(w.last).toBe("2026-10-01");
    expect(w.start.getTime()).toBe(localMidnight("2026-09-29").getTime());
    expect(w.end.getTime()).toBe(localMidnight("2026-10-02").getTime());
  });
});

describe("splitIntoSamples", () => {
  it("sums exactly to the total and stays within waking hours", () => {
    for (const total of [0, 1, 437, 8000, 23_456]) {
      const chunks = splitIntoSamples("u1", "2026-09-30", total);
      expect(chunks.reduce((a, c) => a + c.count, 0)).toBe(total);
      expect(chunks.length).toBeGreaterThanOrEqual(6);
      for (const c of chunks) {
        expect(c.startMinute).toBeGreaterThanOrEqual(7 * 60);
        expect(c.endMinute).toBeLessThanOrEqual(22 * 60);
        expect(c.endMinute).toBeGreaterThan(c.startMinute);
        expect(c.count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is deterministic", () => {
    expect(splitIntoSamples("u1", "2026-09-30", 5000)).toEqual(splitIntoSamples("u1", "2026-09-30", 5000));
    expect(dateRange("2026-09-01", addDays("2026-09-01", 2))).toHaveLength(3);
  });
});
