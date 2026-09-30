import { describe, expect, it } from "vitest";
import {
  clipDates,
  effectiveReason,
  hasChanges,
  isFullSyncReason,
  isLiveUploadDue,
  planDates,
  pruneUploaded,
  selectUploadDays
} from "../src/sync/plan";

const today = "2026-10-01";

describe("planDates", () => {
  it("backfills 90 days ending today", () => {
    const dates = planDates({ reason: "backfill", today, backfillDone: false, lastFullSyncDate: null });
    expect(dates).toHaveLength(90);
    expect(dates[0]).toBe("2026-07-04");
    expect(dates[89]).toBe(today);
  });

  it("uses the full backfill while it is unfinished, except for live/background ticks", () => {
    expect(planDates({ reason: "foreground", today, backfillDone: false, lastFullSyncDate: null })).toHaveLength(90);
    expect(planDates({ reason: "pull", today, backfillDone: false, lastFullSyncDate: null })).toHaveLength(90);
    expect(planDates({ reason: "live", today, backfillDone: false, lastFullSyncDate: null })).toHaveLength(2);
    expect(planDates({ reason: "background", today, backfillDone: false, lastFullSyncDate: null })).toHaveLength(3);
  });

  it("refreshes today and the last 2 days on foreground", () => {
    expect(planDates({ reason: "foreground", today, backfillDone: true, lastFullSyncDate: today })).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01"
    ]);
  });

  it("extends to days since the last sync, capped at 90", () => {
    const from = planDates({ reason: "foreground", today, backfillDone: true, lastFullSyncDate: "2026-09-20" });
    expect(from[0]).toBe("2026-09-20");
    expect(from.at(-1)).toBe(today);
    const capped = planDates({ reason: "pull", today, backfillDone: true, lastFullSyncDate: "2025-01-01" });
    expect(capped).toHaveLength(90);
  });

  it("reads the last 3 days for background and today + yesterday for live", () => {
    expect(planDates({ reason: "background", today, backfillDone: true, lastFullSyncDate: "2026-09-01" })).toHaveLength(3);
    expect(planDates({ reason: "live", today, backfillDone: true, lastFullSyncDate: "2026-09-01" })).toEqual(["2026-09-30", today]);
  });
});

describe("catch-up window", () => {
  it("starts from the last full sync, not the last upload", () => {
    // A background run uploaded yesterday, but the last foreground/pull sync was 10 days ago.
    const dates = planDates({ reason: "foreground", today, backfillDone: true, lastFullSyncDate: "2026-09-21" });
    expect(dates[0]).toBe("2026-09-21");
    expect(dates.at(-1)).toBe(today);
  });
  it("falls back to the recent window when there was no full sync yet", () => {
    expect(planDates({ reason: "pull", today, backfillDone: true, lastFullSyncDate: null })).toHaveLength(3);
  });
  it("only foreground, pull and backfill count as full syncs", () => {
    expect(["foreground", "pull", "backfill"].every(r => isFullSyncReason(r as never))).toBe(true);
    expect(isFullSyncReason("live")).toBe(false);
    expect(isFullSyncReason("background")).toBe(false);
  });
});

describe("selectUploadDays", () => {
  const range = (n: number, steps: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => ({ date: planDates({ reason: "backfill", today, backfillDone: false, lastFullSyncDate: null })[90 - n + i]!, steps: steps(i) }));

  it("flags an all-zero backfill as empty and keeps only yesterday and today", () => {
    const { upload, empty } = selectUploadDays(range(90, () => 0), today);
    expect(empty).toBe(true);
    expect(upload.map(d => d.date)).toEqual(["2026-09-30", today]);
  });
  it("drops zero days before yesterday but keeps real days", () => {
    const { upload, empty } = selectUploadDays(range(90, i => (i % 10 === 0 ? 1000 : 0)), today);
    expect(empty).toBe(false);
    expect(upload.filter(d => d.steps === 0).every(d => d.date >= "2026-09-30")).toBe(true);
    expect(upload.filter(d => d.steps > 0)).toHaveLength(9);
  });
  it("passes short recent reads through untouched, even when zero", () => {
    const days = [{ date: "2026-09-29", steps: 0 }, { date: "2026-09-30", steps: 0 }, { date: today, steps: 0 }];
    expect(selectUploadDays(days, today)).toEqual({ upload: days, empty: false });
  });
});

describe("clipDates", () => {
  it("keeps the last N days, today included", () => {
    const all = planDates({ reason: "backfill", today, backfillDone: false, lastFullSyncDate: null });
    const clipped = clipDates(all, today, 29);
    expect(clipped).toHaveLength(29);
    expect(clipped.at(-1)).toBe(today);
    expect(clipped[0]).toBe("2026-09-03");
  });
  it("keeps everything with no limit", () => {
    expect(clipDates(["2026-01-01", today], today, null)).toEqual(["2026-01-01", today]);
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
