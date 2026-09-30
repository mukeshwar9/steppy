import { describe, expect, it } from "vitest";
import { effectiveReason, hasChanges, isLiveUploadDue, planDates, pruneUploaded } from "../src/sync/plan";

const today = "2026-10-01";

describe("planDates", () => {
  it("backfills 90 days ending today", () => {
    const dates = planDates({ reason: "backfill", today, backfillDone: false, lastSyncedDate: null });
    expect(dates).toHaveLength(90);
    expect(dates[0]).toBe("2026-07-04");
    expect(dates[89]).toBe(today);
  });

  it("uses the full backfill while it is unfinished, except for live/background ticks", () => {
    expect(planDates({ reason: "foreground", today, backfillDone: false, lastSyncedDate: null })).toHaveLength(90);
    expect(planDates({ reason: "pull", today, backfillDone: false, lastSyncedDate: null })).toHaveLength(90);
    expect(planDates({ reason: "live", today, backfillDone: false, lastSyncedDate: null })).toHaveLength(2);
    expect(planDates({ reason: "background", today, backfillDone: false, lastSyncedDate: null })).toHaveLength(3);
  });

  it("refreshes today and the last 2 days on foreground", () => {
    expect(planDates({ reason: "foreground", today, backfillDone: true, lastSyncedDate: today })).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01"
    ]);
  });

  it("extends to days since the last sync, capped at 90", () => {
    const from = planDates({ reason: "foreground", today, backfillDone: true, lastSyncedDate: "2026-09-20" });
    expect(from[0]).toBe("2026-09-20");
    expect(from.at(-1)).toBe(today);
    const capped = planDates({ reason: "pull", today, backfillDone: true, lastSyncedDate: "2025-01-01" });
    expect(capped).toHaveLength(90);
  });

  it("reads the last 3 days for background and today + yesterday for live", () => {
    expect(planDates({ reason: "background", today, backfillDone: true, lastSyncedDate: "2026-09-01" })).toHaveLength(3);
    expect(planDates({ reason: "live", today, backfillDone: true, lastSyncedDate: "2026-09-01" })).toEqual(["2026-09-30", today]);
  });
});

describe("effectiveReason", () => {
  it("sends backfill while unfinished", () => {
    expect(effectiveReason("foreground", false)).toBe("backfill");
    expect(effectiveReason("pull", false)).toBe("backfill");
    expect(effectiveReason("pull", true)).toBe("pull");
    expect(effectiveReason("live", false)).toBe("live");
    expect(effectiveReason("background", false)).toBe("background");
  });
});

describe("live upload", () => {
  const now = new Date("2026-10-01T10:00:00Z");
  it("uploads when values changed", () => {
    expect(isLiveUploadDue({ changed: true, lastUploadAt: now.toISOString(), now })).toBe(true);
  });
  it("skips when unchanged and uploaded less than 5 minutes ago", () => {
    expect(isLiveUploadDue({ changed: false, lastUploadAt: "2026-10-01T09:56:00Z", now })).toBe(false);
  });
  it("uploads when unchanged but older than 5 minutes or never uploaded", () => {
    expect(isLiveUploadDue({ changed: false, lastUploadAt: "2026-10-01T09:55:00Z", now })).toBe(true);
    expect(isLiveUploadDue({ changed: false, lastUploadAt: null, now })).toBe(true);
  });
  it("detects changes against the last uploaded values", () => {
    expect(hasChanges([{ date: today, steps: 10 }], { [today]: 10 })).toBe(false);
    expect(hasChanges([{ date: today, steps: 11 }], { [today]: 10 })).toBe(true);
    expect(hasChanges([{ date: today, steps: 0 }], {})).toBe(true);
  });
  it("prunes old uploaded values", () => {
    expect(pruneUploaded({ "2026-09-01": 1, "2026-09-28": 2, [today]: 3 }, today, 7)).toEqual({ "2026-09-28": 2, [today]: 3 });
  });
});
