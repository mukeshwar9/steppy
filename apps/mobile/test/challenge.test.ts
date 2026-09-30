import { describe, expect, it } from "vitest";
import { canJoinOrLeave, daysLeftText, quickPicks, statusLabel, statusTone, windowFor } from "../src/lib/challenge";

describe("quickPicks", () => {
  it("weekly: today and next Monday", () => {
    // 2026-10-01 is a Thursday
    const picks = quickPicks("WEEKLY", "2026-10-01");
    expect(picks.map((p) => p.startDate)).toEqual(["2026-10-01", "2026-10-05"]);
    expect(picks[1]?.label).toBe("Next Monday");
  });

  it("weekly: on a Monday, next Monday is 7 days away", () => {
    expect(quickPicks("WEEKLY", "2026-10-05")[1]?.startDate).toBe("2026-10-12");
  });

  it("weekly: on a Sunday, next Monday is tomorrow", () => {
    expect(quickPicks("WEEKLY", "2026-10-04")[1]?.startDate).toBe("2026-10-05");
  });

  it("monthly: today and the 1st of next month, including year rollover", () => {
    expect(quickPicks("MONTHLY", "2026-10-15").map((p) => p.startDate)).toEqual(["2026-10-15", "2026-11-01"]);
    expect(quickPicks("MONTHLY", "2026-12-31")[1]?.startDate).toBe("2027-01-01");
    expect(quickPicks("MONTHLY", "2026-01-31")[1]?.startDate).toBe("2026-02-01");
  });

  it("window uses core rules", () => {
    expect(windowFor("WEEKLY", "2026-10-05")).toEqual({ startDate: "2026-10-05", endDate: "2026-10-11" });
    expect(windowFor("MONTHLY", "2026-11-01")).toEqual({ startDate: "2026-11-01", endDate: "2026-11-30" });
  });
});

describe("status helpers", () => {
  it("labels and tones", () => {
    expect(statusLabel("UPCOMING")).toBe("Upcoming");
    expect(statusLabel("ACTIVE")).toBe("Live");
    expect(statusLabel("SETTLING")).toBe("Settling until 10:00");
    expect(statusLabel("FINISHED")).toBe("Finished");
    expect(statusTone("ACTIVE")).toBe("success");
    expect(statusTone("SETTLING")).toBe("warning");
  });

  it("join/leave only before the end", () => {
    expect(canJoinOrLeave("UPCOMING")).toBe(true);
    expect(canJoinOrLeave("ACTIVE")).toBe(true);
    expect(canJoinOrLeave("SETTLING")).toBe(false);
    expect(canJoinOrLeave("FINISHED")).toBe(false);
  });

  it("days left", () => {
    const base = { startDate: "2026-10-05", endDate: "2026-10-11" };
    expect(daysLeftText({ ...base, status: "ACTIVE" }, "2026-10-08")).toBe("4 days left");
    expect(daysLeftText({ ...base, status: "ACTIVE" }, "2026-10-11")).toBe("Last day");
    expect(daysLeftText({ ...base, status: "UPCOMING" }, "2026-10-01")).toBe("Starts in 4 days");
    expect(daysLeftText({ ...base, status: "UPCOMING" }, "2026-10-04")).toBe("Starts tomorrow");
    expect(daysLeftText({ ...base, status: "FINISHED" }, "2026-10-20")).toBe("");
  });
});
