import type { LeaderboardPeriod } from "@steppy/core";
import { formatUpdatedAgo, isStale } from "@steppy/core";

export const PERIODS: Array<{ value: LeaderboardPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "3 Months" }
];

export function periodTitle(period: LeaderboardPeriod): string {
  return PERIODS.find((p) => p.value === period)?.label ?? period;
}

/** "updated 5 min ago" text and stale flag for a member row. */
export function freshness(lastSyncedAt: string | null, now: Date): { text: string; stale: boolean } {
  const ago = formatUpdatedAgo(lastSyncedAt, now);
  return {
    text: lastSyncedAt === null ? "never synced" : `updated ${ago}`,
    stale: isStale(lastSyncedAt, now)
  };
}

export const LIVE_FOOTER = "Live while open · friends update every 15–60 min · days final at 10:00 next day";
