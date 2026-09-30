/**
 * Pure calendar, ranking and challenge rules shared by the API and the mobile app.
 * No Node or React Native APIs: only `Intl` and `Date`, so both runtimes can use it.
 */
import { SETTLE_HOUR } from "./contract.js";
import type { ChallengeKind, ChallengeStatus, LeaderboardPeriod } from "./contract.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 0,
    day: out.day ?? 0,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0
  };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function formatYmd(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Parses YYYY-MM-DD into numeric parts. */
function parseYmd(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Noon-anchored UTC Date for a calendar date, immune to DST-like drift. */
function noonUtc(year: number, month: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function formatUtcDate(d: Date): string {
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Local calendar date (YYYY-MM-DD) of `instant` in IANA timezone `timeZone`. */
export function localDateInZone(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return formatYmd(p.year, p.month, p.day);
}

/** Calendar arithmetic on YYYY-MM-DD strings (timezone independent). */
export function addDays(date: string, days: number): string {
  const { year, month, day } = parseYmd(date);
  const d = noonUtc(year, month, day);
  d.setUTCDate(d.getUTCDate() + days);
  return formatUtcDate(d);
}

/** Adds calendar months, clamping to the month's last day (2026-01-31 + 1 month = 2026-02-28). */
export function addMonths(date: string, months: number): string {
  const { year, month, day } = parseYmd(date);
  const total = year * 12 + (month - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12; // 0..11
  const lastDay = noonUtc(ny, nm + 2, 0).getUTCDate(); // day 0 of next month
  return formatYmd(ny, nm + 1, Math.min(day, lastDay));
}

/** Inclusive list of dates from..to (empty if from > to). */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  // YYYY-MM-DD strings compare chronologically.
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Inclusive date range of a leaderboard period ending at `today` (see Leaderboard docs). */
export function periodRange(period: LeaderboardPeriod, today: string): { from: string; to: string } {
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const { year, month, day } = parseYmd(today);
      const isoWeekday = (noonUtc(year, month, day).getUTCDay() + 6) % 7; // Monday = 0
      return { from: addDays(today, -isoWeekday), to: today };
    }
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "quarter":
      return { from: addDays(today, -89), to: today };
  }
}

/** Offset (ms) of `timeZone` from UTC at `instantMs`: local wall clock minus UTC. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const p = zonedParts(new Date(instantMs), timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Compare at second resolution (instantMs may carry milliseconds).
  return wall - Math.floor(instantMs / 1000) * 1000;
}

/** Instant at which `date` settles: SETTLE_HOUR:00 local time on the next day in `timeZone`. */
export function settleInstant(date: string, timeZone: string): Date {
  const next = parseYmd(addDays(date, 1));
  const wall = new Date(0);
  wall.setUTCFullYear(next.year, next.month - 1, next.day);
  wall.setUTCHours(SETTLE_HOUR, 0, 0, 0);
  const wallMs = wall.getTime();
  let guess = wallMs - zoneOffsetMs(wallMs, timeZone);
  for (let i = 0; i < 3; i++) {
    const corrected = wallMs - zoneOffsetMs(guess, timeZone);
    if (corrected === guess) break;
    guess = corrected;
  }
  return new Date(guess);
}

export function isDaySettled(date: string, timeZone: string, now: Date): boolean {
  return now.getTime() >= settleInstant(date, timeZone).getTime();
}

/** Inclusive window of a challenge that starts on `startDate`. */
export function challengeWindow(kind: ChallengeKind, startDate: string): { startDate: string; endDate: string } {
  const endDate = kind === "WEEKLY" ? addDays(startDate, 6) : addDays(addMonths(startDate, 1), -1);
  return { startDate, endDate };
}

export function challengeStatus(
  challenge: { startDate: string; endDate: string; timezone: string },
  now: Date
): ChallengeStatus {
  const today = localDateInZone(now, challenge.timezone);
  if (today < challenge.startDate) return "UPCOMING";
  if (today <= challenge.endDate) return "ACTIVE";
  return isDaySettled(challenge.endDate, challenge.timezone, now) ? "FINISHED" : "SETTLING";
}

/**
 * Competition ranking by steps descending: ties share a rank and the next rank skips (1, 1, 3).
 * Ties keep a stable order by `tieBreak` (display name) ascending. Input is not mutated.
 */
export function rankBySteps<T extends { steps: number; tieBreak?: string }>(entries: T[]): Array<T & { rank: number }> {
  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        b.entry.steps - a.entry.steps ||
        (a.entry.tieBreak ?? "").localeCompare(b.entry.tieBreak ?? "") ||
        a.index - b.index
    );
  const out: Array<T & { rank: number }> = [];
  let rank = 1;
  sorted.forEach(({ entry }, i) => {
    const prev = sorted[i - 1];
    if (prev && entry.steps !== prev.entry.steps) rank = i + 1;
    out.push({ ...entry, rank });
  });
  return out;
}

/** Everyone sharing the top step count; empty when the list is empty or the top count is 0. */
export function leadersOf<T extends { userId: string; steps: number }>(entries: T[]): string[] {
  let max = 0;
  for (const e of entries) if (e.steps > max) max = e.steps;
  if (max <= 0) return [];
  return entries.filter((e) => e.steps === max).map((e) => e.userId);
}

/**
 * Human "updated X ago" label: null -> "never synced", < 1 min -> "just now", "5 min ago",
 * "2 h ago", "yesterday", "3 d ago".
 */
export function formatUpdatedAgo(lastSyncedAt: string | null, now: Date): string {
  if (lastSyncedAt === null) return "never synced";
  const then = Date.parse(lastSyncedAt);
  if (Number.isNaN(then)) return "never synced";
  const diff = now.getTime() - then;
  if (diff < MINUTE_MS) return "just now";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} min ago`;
  if (diff < 24 * HOUR_MS) return `${Math.floor(diff / HOUR_MS)} h ago`;
  if (diff < 48 * HOUR_MS) return "yesterday";
  return `${Math.floor(diff / (24 * HOUR_MS))} d ago`;
}

/** True when the last sync is older than `staleMinutes` (default 90) or missing. */
export function isStale(lastSyncedAt: string | null, now: Date, staleMinutes = 90): boolean {
  if (lastSyncedAt === null) return true;
  const then = Date.parse(lastSyncedAt);
  if (Number.isNaN(then)) return true;
  return now.getTime() - then > staleMinutes * MINUTE_MS;
}
