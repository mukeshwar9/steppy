import { describe, expect, it } from "vitest";
import { addDays, dateRange } from "@steppy/core";
import { dayFraction, demoDays, demoFullDaySteps, demoHistory, demoSteps, hashString, weekdayOf } from "../src/health/demo";

describe("demo provider", () => {
  it("is deterministic per user and date", () => {
    expect(demoFullDaySteps("u1", "2026-09-01")).toBe(demoFullDaySteps("u1", "2026-09-01"));
    expect(hashString("a")).toBe(hashString("a"));
  });

  it("differs across users and dates", () => {
    const a = dateRange("2026-08-01", "2026-09-30").map(d => demoFullDaySteps("u1", d));
    const b = dateRange("2026-08-01", "2026-09-30").map(d => demoFullDaySteps("u2", d));
    expect(a).not.toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(40);
  });

  it("stays in a realistic range with occasional rest days", () => {
    const values = dateRange("2026-01-01", "2026-12-31").map(d => demoFullDaySteps("user-x", d));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(500);
    expect(Math.max(...values)).toBeLessThanOrEqual(35_000);
    const rest = values.filter(v => v < 3700).length;
    expect(rest).toBeGreaterThan(5);
    expect(rest).toBeLessThan(values.length * 0.25);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    expect(avg).toBeGreaterThan(5000);
    expect(avg).toBeLessThan(12_000);
  });

  it("varies weekday vs weekend", () => {
    expect(weekdayOf("2026-09-26")).toBe(6); // Saturday
    const days = dateRange("2026-01-01", "2026-12-31");
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const weekend = days.filter(d => [0, 6].includes(weekdayOf(d))).map(d => demoFullDaySteps("u1", d));
    const weekday = days.filter(d => ![0, 6].includes(weekdayOf(d))).map(d => demoFullDaySteps("u1", d));
    expect(mean(weekend)).not.toBeCloseTo(mean(weekday), 0);
  });

  it("scales today with the elapsed fraction and gives 0 for the future", () => {
    const full = demoFullDaySteps("u1", "2026-10-01");
    expect(demoSteps("u1", "2026-10-01", "2026-10-01", 0.5)).toBe(Math.round(full * 0.5));
    expect(demoSteps("u1", "2026-10-01", "2026-10-01", 0)).toBe(0);
    expect(demoSteps("u1", "2026-10-01", "2026-10-01", 1)).toBe(full);
    expect(demoSteps("u1", "2026-10-02", "2026-10-01", 1)).toBe(0);
    expect(demoSteps("u1", "2026-09-30", "2026-10-01", 0.1)).toBe(demoFullDaySteps("u1", "2026-09-30"));
  });

  it("computes the local day fraction in the given timezone", () => {
    const instant = new Date("2026-10-01T12:00:00Z");
    expect(dayFraction(instant, "UTC")).toBeCloseTo(0.5, 5);
    expect(dayFraction(instant, "Asia/Kolkata")).toBeCloseTo((17.5 * 3600) / 86_400, 5);
  });

  it("builds days and history with the local date in the timezone", () => {
    const now = new Date("2026-10-01T23:30:00Z"); // already 2026-10-02 in Kolkata
    const days = demoDays("u1", ["2026-10-01", "2026-10-02"], now, "Asia/Kolkata");
    expect(days[0]!.steps).toBe(demoFullDaySteps("u1", "2026-10-01"));
    expect(days[1]!.steps).toBeLessThan(demoFullDaySteps("u1", "2026-10-02") + 1);
    const history = demoHistory("u1", 90, now, "UTC");
    expect(history).toHaveLength(90);
    expect(history[0]!.date).toBe(addDays("2026-10-01", -89));
    expect(history[89]!.date).toBe("2026-10-01");
  });
});
