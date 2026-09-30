/**
 * Pure calendar, ranking and challenge rules shared by the API and the mobile app.
 * No Node or React Native APIs: only `Intl` and `Date`, so both runtimes can use it.
 */
import type { ChallengeKind, ChallengeStatus, LeaderboardPeriod } from "./contract.js";

/** Local calendar date (YYYY-MM-DD) of `instant` in IANA timezone `timeZone`. */
export function localDateInZone(instant: Date, timeZone: string): string {
  throw new Error("not implemented");
}

/** Calendar arithmetic on YYYY-MM-DD strings (timezone independent). */
export function addDays(date: string, days: number): string {
  throw new Error("not implemented");
}

/** Adds calendar months, clamping to the month's last day (2026-01-31 + 1 month = 2026-02-28). */
export function addMonths(date: string, months: number): string {
  throw new Error("not implemented");
}

/** Inclusive list of dates from..to (empty if from > to). */
export function dateRange(from: string, to: string): string[] {
  throw new Error("not implemented");
}

/** Inclusive date range of a leaderboard period ending at `today` (see Leaderboard docs). */
export function periodRange(period: LeaderboardPeriod, today: string): { from: string; to: string } {
  throw new Error("not implemented");
}

/** Instant at which `date` settles: SETTLE_HOUR:00 local time on the next day in `timeZone`. */
export function settleInstant(date: string, timeZone: string): Date {
  throw new Error("not implemented");
}

export function isDaySettled(date: string, timeZone: string, now: Date): boolean {
  throw new Error("not implemented");
}

/** Inclusive window of a challenge that starts on `startDate`. */
export function challengeWindow(kind: ChallengeKind, startDate: string): { startDate: string; endDate: string } {
  throw new Error("not implemented");
}

export function challengeStatus(
  challenge: { startDate: string; endDate: string; timezone: string },
  now: Date
): ChallengeStatus {
  throw new Error("not implemented");
}

/**
 * Competition ranking by steps descending: ties share a rank and the next rank skips (1, 1, 3).
 * Ties keep a stable order by `tieBreak` (display name) ascending. Input is not mutated.
 */
export function rankBySteps<T extends { steps: number; tieBreak?: string }>(entries: T[]): Array<T & { rank: number }> {
  throw new Error("not implemented");
}

/** Everyone sharing the top step count; empty when the list is empty or the top count is 0. */
export function leadersOf<T extends { userId: string; steps: number }>(entries: T[]): string[] {
  throw new Error("not implemented");
}

/**
 * Human "updated X ago" label: null -> "never synced", < 1 min -> "just now", "5 min ago",
 * "2 h ago", "yesterday", "3 d ago".
 */
export function formatUpdatedAgo(lastSyncedAt: string | null, now: Date): string {
  throw new Error("not implemented");
}

/** True when the last sync is older than `staleMinutes` (default 90) or missing. */
export function isStale(lastSyncedAt: string | null, now: Date, staleMinutes = 90): boolean {
  throw new Error("not implemented");
}
