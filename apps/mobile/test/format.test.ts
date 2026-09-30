import { describe, expect, it } from "vitest";
import { formatDayMonth, formatSteps, formatWindow, initials, plural, sourceLabel, weekdayShort } from "../src/lib/format";

describe("format", () => {
  it("formats steps with thousands separators", () => {
    expect(formatSteps(0)).toBe("0");
    expect(formatSteps(999)).toBe("999");
    expect(formatSteps(12345)).toBe("12,345");
    expect(formatSteps(1234567.6)).toBe("1,234,568");
    expect(formatSteps(null)).toBe("–");
    expect(formatSteps(undefined)).toBe("–");
  });

  it("labels sources", () => {
    expect(sourceLabel("HEALTHKIT")).toBe("Apple Health");
    expect(sourceLabel("HEALTH_CONNECT")).toBe("Health Connect");
    expect(sourceLabel("DEMO")).toBe("Demo");
    expect(sourceLabel(null)).toBe("No source yet");
  });

  it("formats dates without Intl", () => {
    expect(weekdayShort("2026-10-01")).toBe("Thu");
    expect(formatDayMonth("2026-10-01")).toBe("Oct 1");
    expect(formatWindow("2026-10-05", "2026-10-11")).toBe("Oct 5 – Oct 11");
  });

  it("builds initials and plurals", () => {
    expect(initials("alex")).toBe("A");
    expect(initials("Alex Rivera Jones")).toBe("AJ");
    expect(initials("  ")).toBe("?");
    expect(plural(1, "member")).toBe("1 member");
    expect(plural(3, "member")).toBe("3 members");
  });
});
