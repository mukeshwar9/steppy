import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  challengeStatus,
  challengeWindow,
  dateRange,
  formatUpdatedAgo,
  isDaySettled,
  isStale,
  leadersOf,
  localDateInZone,
  periodRange,
  rankBySteps,
  settleInstant
} from "../src/domain.js";

const iso = (d: Date) => d.toISOString();

describe("localDateInZone", () => {
  it("handles zones ahead of and behind UTC", () => {
    const t = new Date("2026-03-10T23:30:00Z");
    expect(localDateInZone(t, "UTC")).toBe("2026-03-10");
    expect(localDateInZone(t, "Asia/Kolkata")).toBe("2026-03-11");
    expect(localDateInZone(t, "Pacific/Auckland")).toBe("2026-03-11");
    expect(localDateInZone(t, "America/New_York")).toBe("2026-03-10");
    expect(localDateInZone(t, "America/Los_Angeles")).toBe("2026-03-10");
  });
  it("rolls over at local midnight exactly", () => {
    expect(localDateInZone(new Date("2026-03-10T18:29:59Z"), "Asia/Kolkata")).toBe("2026-03-10");
    expect(localDateInZone(new Date("2026-03-10T18:30:00Z"), "Asia/Kolkata")).toBe("2026-03-11");
  });
  it("crosses year boundary", () => {
    expect(localDateInZone(new Date("2025-12-31T20:00:00Z"), "Pacific/Auckland")).toBe("2026-01-01");
  });
  it("respects DST", () => {
    // NY is UTC-4 in summer: 03:30Z is still the previous day.
    expect(localDateInZone(new Date("2026-07-01T03:30:00Z"), "America/New_York")).toBe("2026-06-30");
    // UTC-5 in winter: 04:30Z is the previous day, 05:00Z is the new day.
    expect(localDateInZone(new Date("2026-01-01T04:59:00Z"), "America/New_York")).toBe("2025-12-31");
    expect(localDateInZone(new Date("2026-01-01T05:00:00Z"), "America/New_York")).toBe("2026-01-01");
  });
  it("does not produce hour 24 at midnight", () => {
    expect(localDateInZone(new Date("2026-03-10T00:00:00Z"), "UTC")).toBe("2026-03-10");
  });
});

describe("addDays", () => {
  it("adds and subtracts", () => {
    expect(addDays("2026-03-10", 1)).toBe("2026-03-11");
    expect(addDays("2026-03-10", -10)).toBe("2026-02-28");
    expect(addDays("2026-03-10", 0)).toBe("2026-03-10");
  });
  it("crosses month, year and leap boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", 365)).toBe("2027-01-01");
    expect(addDays("2026-01-01", 89)).toBe("2026-03-31");
  });
  it("is stable across DST dates", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  });
  it("rejects malformed input", () => {
    expect(() => addDays("2026-3-1", 1)).toThrow();
  });
});

describe("addMonths", () => {
  it("clamps to last day of month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonths("2026-05-31", -1)).toBe("2026-04-30");
  });
  it("keeps the day when possible", () => {
    expect(addMonths("2026-03-15", 1)).toBe("2026-04-15");
    expect(addMonths("2026-03-15", 0)).toBe("2026-03-15");
  });
  it("crosses years", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonths("2026-01-31", 12)).toBe("2027-01-31");
    expect(addMonths("2026-01-31", -13)).toBe("2024-12-31");
  });
});

describe("dateRange", () => {
  it("is inclusive", () => {
    expect(dateRange("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
  it("returns a single date when from == to", () => {
    expect(dateRange("2026-03-10", "2026-03-10")).toEqual(["2026-03-10"]);
  });
  it("returns empty when from > to", () => {
    expect(dateRange("2026-03-11", "2026-03-10")).toEqual([]);
  });
  it("covers 90 days", () => {
    expect(dateRange("2026-01-01", "2026-03-31")).toHaveLength(90);
  });
});

describe("periodRange", () => {
  it("today", () => {
    expect(periodRange("today", "2026-03-10")).toEqual({ from: "2026-03-10", to: "2026-03-10" });
  });
  it("week starts on Monday", () => {
    // 2026-03-09 is a Monday.
    expect(periodRange("week", "2026-03-09")).toEqual({ from: "2026-03-09", to: "2026-03-09" });
    expect(periodRange("week", "2026-03-10")).toEqual({ from: "2026-03-09", to: "2026-03-10" });
    expect(periodRange("week", "2026-03-15")).toEqual({ from: "2026-03-09", to: "2026-03-15" }); // Sunday
    expect(periodRange("week", "2026-03-16")).toEqual({ from: "2026-03-16", to: "2026-03-16" });
  });
  it("week crosses month and year", () => {
    // 2026-01-01 is a Thursday.
    expect(periodRange("week", "2026-01-01")).toEqual({ from: "2025-12-29", to: "2026-01-01" });
    expect(periodRange("week", "2026-04-01")).toEqual({ from: "2026-03-30", to: "2026-04-01" });
  });
  it("month starts on the 1st", () => {
    expect(periodRange("month", "2026-03-10")).toEqual({ from: "2026-03-01", to: "2026-03-10" });
    expect(periodRange("month", "2026-03-01")).toEqual({ from: "2026-03-01", to: "2026-03-01" });
    expect(periodRange("month", "2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("quarter is the last 90 days", () => {
    const r = periodRange("quarter", "2026-03-31");
    expect(r).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(dateRange(r.from, r.to)).toHaveLength(90);
    expect(periodRange("quarter", "2026-01-10").from).toBe("2025-10-13");
  });
});

describe("settleInstant", () => {
  it("UTC: 10:00Z next day", () => {
    expect(iso(settleInstant("2026-03-10", "UTC"))).toBe("2026-03-11T10:00:00.000Z");
    expect(iso(settleInstant("2026-12-31", "UTC"))).toBe("2027-01-01T10:00:00.000Z");
  });
  it("Asia/Kolkata (+05:30)", () => {
    expect(iso(settleInstant("2026-03-10", "Asia/Kolkata"))).toBe("2026-03-11T04:30:00.000Z");
  });
  it("Pacific/Auckland: NZDT (+13) and NZST (+12)", () => {
    expect(iso(settleInstant("2026-01-15", "Pacific/Auckland"))).toBe("2026-01-15T21:00:00.000Z");
    expect(iso(settleInstant("2026-07-15", "Pacific/Auckland"))).toBe("2026-07-15T22:00:00.000Z");
  });
  it("America/New_York normal winter and summer", () => {
    expect(iso(settleInstant("2026-01-15", "America/New_York"))).toBe("2026-01-16T15:00:00.000Z"); // EST
    expect(iso(settleInstant("2026-07-15", "America/New_York"))).toBe("2026-07-16T14:00:00.000Z"); // EDT
  });
  it("America/New_York spring forward (2026-03-08)", () => {
    // Day before the transition: settle is 10:00 EDT on Mar 8 (already EDT at 10:00).
    expect(iso(settleInstant("2026-03-07", "America/New_York"))).toBe("2026-03-08T14:00:00.000Z");
    // Transition day: settle Mar 9 10:00 EDT.
    expect(iso(settleInstant("2026-03-08", "America/New_York"))).toBe("2026-03-09T14:00:00.000Z");
    // Two days before: Mar 7 10:00 EST.
    expect(iso(settleInstant("2026-03-06", "America/New_York"))).toBe("2026-03-07T15:00:00.000Z");
  });
  it("America/New_York fall back (2026-11-01)", () => {
    // Oct 31 settles Nov 1 10:00 EST (transition at 02:00 already passed).
    expect(iso(settleInstant("2026-10-31", "America/New_York"))).toBe("2026-11-01T15:00:00.000Z");
    // Oct 30 settles Oct 31 10:00 EDT.
    expect(iso(settleInstant("2026-10-30", "America/New_York"))).toBe("2026-10-31T14:00:00.000Z");
    expect(iso(settleInstant("2026-11-01", "America/New_York"))).toBe("2026-11-02T15:00:00.000Z");
  });
  it("Pacific/Auckland DST transitions", () => {
    // NZ DST ends 2026-04-05 03:00 NZDT, starts 2026-09-27 02:00 NZST.
    // Apr 4 settles Apr 5 10:00 NZST (+12) = Apr 4 22:00Z (transition at 03:00 already passed).
    expect(iso(settleInstant("2026-04-04", "Pacific/Auckland"))).toBe("2026-04-04T22:00:00.000Z");
    // Apr 3 settles Apr 4 10:00 NZDT (+13) = Apr 3 21:00Z.
    expect(iso(settleInstant("2026-04-03", "Pacific/Auckland"))).toBe("2026-04-03T21:00:00.000Z");
    // Sep 26 settles Sep 27 10:00 NZDT (+13, after 02:00 jump) = Sep 26 21:00Z.
    expect(iso(settleInstant("2026-09-26", "Pacific/Auckland"))).toBe("2026-09-26T21:00:00.000Z");
  });
  it("round-trips: settle instant is 10:00 local next day in several zones", () => {
    for (const tz of ["UTC", "Asia/Kolkata", "Pacific/Auckland", "America/New_York", "Europe/London", "Australia/Lord_Howe"]) {
      for (const date of ["2026-03-07", "2026-03-08", "2026-03-28", "2026-04-04", "2026-09-26", "2026-10-31", "2026-11-01"]) {
        const inst = settleInstant(date, tz);
        expect(localDateInZone(inst, tz)).toBe(addDays(date, 1));
        const hh = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(inst);
        expect(hh).toBe("10:00");
      }
    }
  });
});

describe("isDaySettled", () => {
  it("flips exactly at the settle instant", () => {
    const tz = "Asia/Kolkata";
    expect(isDaySettled("2026-03-10", tz, new Date("2026-03-11T04:29:59.999Z"))).toBe(false);
    expect(isDaySettled("2026-03-10", tz, new Date("2026-03-11T04:30:00Z"))).toBe(true);
  });
  it("is not settled while the day is ongoing", () => {
    expect(isDaySettled("2026-03-10", "UTC", new Date("2026-03-10T12:00:00Z"))).toBe(false);
  });
});

describe("challengeWindow", () => {
  it("weekly is 7 days inclusive", () => {
    expect(challengeWindow("WEEKLY", "2026-03-09")).toEqual({ startDate: "2026-03-09", endDate: "2026-03-15" });
    expect(challengeWindow("WEEKLY", "2026-12-28")).toEqual({ startDate: "2026-12-28", endDate: "2027-01-03" });
  });
  it("monthly is start + 1 month - 1 day", () => {
    expect(challengeWindow("MONTHLY", "2026-03-01")).toEqual({ startDate: "2026-03-01", endDate: "2026-03-31" });
    expect(challengeWindow("MONTHLY", "2026-03-15")).toEqual({ startDate: "2026-03-15", endDate: "2026-04-14" });
    expect(challengeWindow("MONTHLY", "2026-12-15")).toEqual({ startDate: "2026-12-15", endDate: "2027-01-14" });
  });
  it("monthly clamps: 2026-01-31 ends 2026-02-27", () => {
    expect(challengeWindow("MONTHLY", "2026-01-31")).toEqual({ startDate: "2026-01-31", endDate: "2026-02-27" });
    expect(challengeWindow("MONTHLY", "2028-01-31").endDate).toBe("2028-02-28");
  });
});

describe("challengeStatus", () => {
  const c = { startDate: "2026-03-09", endDate: "2026-03-15", timezone: "America/New_York" };
  it("UPCOMING before start in group timezone", () => {
    // 2026-03-09T03:59Z is still Mar 8 in New York (EDT, UTC-4).
    expect(challengeStatus(c, new Date("2026-03-09T03:59:59Z"))).toBe("UPCOMING");
  });
  it("ACTIVE from local start to end inclusive", () => {
    expect(challengeStatus(c, new Date("2026-03-09T04:00:00Z"))).toBe("ACTIVE");
    expect(challengeStatus(c, new Date("2026-03-12T12:00:00Z"))).toBe("ACTIVE");
    // Mar 16 03:59:59Z = Mar 15 23:59:59 EDT.
    expect(challengeStatus(c, new Date("2026-03-16T03:59:59Z"))).toBe("ACTIVE");
  });
  it("SETTLING after end until 10:00 next day local", () => {
    expect(challengeStatus(c, new Date("2026-03-16T04:00:00Z"))).toBe("SETTLING");
    expect(challengeStatus(c, new Date("2026-03-16T13:59:59Z"))).toBe("SETTLING");
  });
  it("FINISHED from 10:00 next day local", () => {
    expect(challengeStatus(c, new Date("2026-03-16T14:00:00Z"))).toBe("FINISHED");
    expect(challengeStatus(c, new Date("2026-06-01T00:00:00Z"))).toBe("FINISHED");
  });
  it("works for single-day and UTC challenges", () => {
    const one = { startDate: "2026-03-10", endDate: "2026-03-10", timezone: "UTC" };
    expect(challengeStatus(one, new Date("2026-03-09T23:59:59Z"))).toBe("UPCOMING");
    expect(challengeStatus(one, new Date("2026-03-10T00:00:00Z"))).toBe("ACTIVE");
    expect(challengeStatus(one, new Date("2026-03-11T09:59:59Z"))).toBe("SETTLING");
    expect(challengeStatus(one, new Date("2026-03-11T10:00:00Z"))).toBe("FINISHED");
  });
  it("uses group timezone ahead of UTC (Kolkata)", () => {
    const k = { startDate: "2026-03-10", endDate: "2026-03-10", timezone: "Asia/Kolkata" };
    expect(challengeStatus(k, new Date("2026-03-09T18:29:59Z"))).toBe("UPCOMING");
    expect(challengeStatus(k, new Date("2026-03-09T18:30:00Z"))).toBe("ACTIVE");
    expect(challengeStatus(k, new Date("2026-03-10T18:30:00Z"))).toBe("SETTLING");
    expect(challengeStatus(k, new Date("2026-03-11T04:30:00Z"))).toBe("FINISHED");
  });
});

describe("rankBySteps", () => {
  it("orders by steps descending with competition ranks", () => {
    const r = rankBySteps([
      { id: "a", steps: 100 },
      { id: "b", steps: 300 },
      { id: "c", steps: 200 }
    ]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([["b", 1], ["c", 2], ["a", 3]]);
  });
  it("ties share a rank and the next rank skips", () => {
    const r = rankBySteps([
      { id: "a", steps: 100, tieBreak: "Ann" },
      { id: "b", steps: 300, tieBreak: "Bob" },
      { id: "c", steps: 300, tieBreak: "Cat" },
      { id: "d", steps: 50, tieBreak: "Dan" },
      { id: "e", steps: 100, tieBreak: "Eve" }
    ]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([["b", 1], ["c", 1], ["a", 3], ["e", 3], ["d", 5]]);
  });
  it("orders ties by tieBreak ascending", () => {
    const r = rankBySteps([
      { id: "z", steps: 10, tieBreak: "zed" },
      { id: "a", steps: 10, tieBreak: "alice" },
      { id: "m", steps: 10, tieBreak: "Mia" }
    ]);
    expect(r.map((x) => x.id)).toEqual(["a", "m", "z"]);
    expect(r.every((x) => x.rank === 1)).toBe(true);
  });
  it("is stable when tieBreak is missing or equal", () => {
    const r = rankBySteps([
      { id: "1", steps: 5 },
      { id: "2", steps: 5 },
      { id: "3", steps: 5 }
    ]);
    expect(r.map((x) => x.id)).toEqual(["1", "2", "3"]);
    const r2 = rankBySteps([
      { id: "1", steps: 5, tieBreak: "same" },
      { id: "2", steps: 5, tieBreak: "same" }
    ]);
    expect(r2.map((x) => x.id)).toEqual(["1", "2"]);
  });
  it("treats missing tieBreak as empty string (sorts first)", () => {
    const r = rankBySteps([
      { id: "named", steps: 5, tieBreak: "A" },
      { id: "anon", steps: 5 }
    ]);
    expect(r.map((x) => x.id)).toEqual(["anon", "named"]);
  });
  it("handles zero steps, empty input and does not mutate", () => {
    expect(rankBySteps([])).toEqual([]);
    const input = [
      { id: "a", steps: 0 },
      { id: "b", steps: 1 },
      { id: "c", steps: 0 }
    ];
    const copy = JSON.parse(JSON.stringify(input));
    const r = rankBySteps(input);
    expect(input).toEqual(copy);
    expect(r.map((x) => [x.id, x.rank])).toEqual([["b", 1], ["a", 2], ["c", 2]]);
    expect("rank" in input[0]).toBe(false);
  });
  it("preserves extra fields", () => {
    const r = rankBySteps([{ steps: 1, name: "x" }]);
    expect(r[0]).toEqual({ steps: 1, name: "x", rank: 1 });
  });
});

describe("leadersOf", () => {
  it("returns the single leader", () => {
    expect(leadersOf([{ userId: "a", steps: 1 }, { userId: "b", steps: 5 }])).toEqual(["b"]);
  });
  it("returns all tied leaders in input order", () => {
    expect(leadersOf([{ userId: "a", steps: 5 }, { userId: "b", steps: 1 }, { userId: "c", steps: 5 }])).toEqual(["a", "c"]);
  });
  it("returns [] for empty or all-zero", () => {
    expect(leadersOf([])).toEqual([]);
    expect(leadersOf([{ userId: "a", steps: 0 }, { userId: "b", steps: 0 }])).toEqual([]);
  });
});

describe("formatUpdatedAgo", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
  it("never synced", () => {
    expect(formatUpdatedAgo(null, now)).toBe("never synced");
  });
  it("just now under a minute, including future timestamps", () => {
    expect(formatUpdatedAgo(ago(0), now)).toBe("just now");
    expect(formatUpdatedAgo(ago(59 * S + 999), now)).toBe("just now");
    expect(formatUpdatedAgo(ago(-5 * M), now)).toBe("just now");
  });
  it("minutes", () => {
    expect(formatUpdatedAgo(ago(M), now)).toBe("1 min ago");
    expect(formatUpdatedAgo(ago(5 * M + 30 * S), now)).toBe("5 min ago");
    expect(formatUpdatedAgo(ago(59 * M + 59 * S), now)).toBe("59 min ago");
  });
  it("hours (floored)", () => {
    expect(formatUpdatedAgo(ago(H), now)).toBe("1 h ago");
    expect(formatUpdatedAgo(ago(2 * H + 59 * M), now)).toBe("2 h ago");
    expect(formatUpdatedAgo(ago(23 * H + 59 * M), now)).toBe("23 h ago");
  });
  it("yesterday between 24 and 48 hours", () => {
    expect(formatUpdatedAgo(ago(24 * H), now)).toBe("yesterday");
    expect(formatUpdatedAgo(ago(47 * H + 59 * M), now)).toBe("yesterday");
  });
  it("days from 48 hours", () => {
    expect(formatUpdatedAgo(ago(48 * H), now)).toBe("2 d ago");
    expect(formatUpdatedAgo(ago(3 * D + 5 * H), now)).toBe("3 d ago");
    expect(formatUpdatedAgo(ago(40 * D), now)).toBe("40 d ago");
  });
});

describe("isStale", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  it("null is stale", () => {
    expect(isStale(null, now)).toBe(true);
  });
  it("fresh within default 90 min, boundary not stale", () => {
    expect(isStale(ago(5), now)).toBe(false);
    expect(isStale(ago(90), now)).toBe(false);
    expect(isStale(ago(91), now)).toBe(true);
  });
  it("custom threshold", () => {
    expect(isStale(ago(20), now, 15)).toBe(true);
    expect(isStale(ago(10), now, 15)).toBe(false);
  });
  it("future timestamps are not stale", () => {
    expect(isStale(ago(-10), now)).toBe(false);
  });
});
