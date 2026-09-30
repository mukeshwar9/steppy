/** Pure helpers turning health-store query results into StepDay[] keyed by local date. */
import { addDays, dateRange, localDateInZone } from "@steppy/core";
import type { StepDay } from "@steppy/core";

export const MAX_DAILY_STEPS = 200_000;

/** Local midnight (device timezone) of a YYYY-MM-DD date as an instant. */
export function localMidnight(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Smallest and largest date of a non-empty list. */
export function dateBounds(dates: string[]): { first: string; last: string } {
  let first = dates[0]!;
  let last = dates[0]!;
  for (const d of dates) {
    if (d < first) first = d;
    if (d > last) last = d;
  }
  return { first, last };
}

/** Time window [start, end) covering every date in the list, in device-local midnights. */
export function queryWindow(dates: string[]): { start: Date; end: Date; first: string; last: string } {
  const { first, last } = dateBounds(dates);
  return { start: localMidnight(first), end: localMidnight(addDays(last, 1)), first, last };
}

export function sanitizeSteps(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(MAX_DAILY_STEPS, Math.max(0, n));
}

/** One StepDay per requested date (missing dates become 0), sorted ascending, deduplicated. */
export function toStepDays(dates: string[], totals: ReadonlyMap<string, number>): StepDay[] {
  return [...new Set(dates)].sort().map(date => ({ date, steps: sanitizeSteps(totals.get(date)) }));
}

/** HealthKit statistics-collection buckets -> date totals. Bucket date = local date of its start. */
export function healthKitBucketsToTotals(
  buckets: ReadonlyArray<{ startDate?: Date; sumQuantity?: { quantity: number } }>,
  timeZone: string
): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of buckets) {
    if (!b.startDate) continue;
    const date = localDateInZone(b.startDate, timeZone);
    out.set(date, (out.get(date) ?? 0) + (b.sumQuantity?.quantity ?? 0));
  }
  return out;
}

/**
 * Health Connect aggregateGroupByPeriod groups -> date totals. `startTime` is a LocalDateTime
 * string ("2026-09-30T00:00") in the device zone; an instant with Z/offset is converted instead.
 */
export function healthConnectGroupsToTotals(
  groups: ReadonlyArray<{ startTime: string; result: { COUNT_TOTAL?: number } }>,
  timeZone: string
): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of groups) {
    const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(g.startTime);
    const date = hasOffset ? localDateInZone(new Date(g.startTime), timeZone) : g.startTime.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.set(date, (out.get(date) ?? 0) + (g.result.COUNT_TOTAL ?? 0));
  }
  return out;
}

export { dateRange };
