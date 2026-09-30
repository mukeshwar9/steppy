/** Pure sync planning: which dates to read and whether to upload. No native modules. */
import { BACKFILL_DAYS, addDays, dateRange } from "@steppy/core";
import type { StepDay, SyncReason } from "@steppy/core";

export const LIVE_INTERVAL_MS = 60_000;
export const LIVE_MAX_UPLOAD_AGE_MS = 5 * 60_000;
/** Recent window refreshed on open/foreground/background: today + last 2 days. */
export const RECENT_DAYS = 3;

export type PlanInput = {
  reason: SyncReason;
  /** Today's local date (device timezone). */
  today: string;
  backfillDone: boolean;
  /** Local date of the last successful upload, null if never. */
  lastSyncedDate: string | null;
};

/** The reason actually sent to the API: an unfinished backfill always goes as "backfill". */
export function effectiveReason(reason: SyncReason, backfillDone: boolean): SyncReason {
  if (reason === "live" || reason === "background") return reason;
  return backfillDone ? reason : "backfill";
}

/** Dates (ascending, contiguous) to read for a sync, at most BACKFILL_DAYS. */
export function planDates(input: PlanInput): string[] {
  const { reason, today, backfillDone, lastSyncedDate } = input;
  const earliest = addDays(today, -(BACKFILL_DAYS - 1));
  if (reason === "backfill" || (!backfillDone && reason !== "live" && reason !== "background")) {
    return dateRange(earliest, today);
  }
  if (reason === "live") return dateRange(addDays(today, -1), today);
  let from = addDays(today, -(RECENT_DAYS - 1));
  if (reason !== "background" && lastSyncedDate && lastSyncedDate < from) from = lastSyncedDate;
  if (from < earliest) from = earliest;
  return dateRange(from, today);
}

/** True when any read day differs from what was last uploaded. */
export function hasChanges(days: StepDay[], lastUploaded: Readonly<Record<string, number>>): boolean {
  return days.some(d => lastUploaded[d.date] !== d.steps);
}

/** Live ticks upload only when values changed or the last upload is older than 5 minutes. */
export function isLiveUploadDue(args: { changed: boolean; lastUploadAt: string | null; now: Date }): boolean {
  if (args.changed) return true;
  if (!args.lastUploadAt) return true;
  const last = Date.parse(args.lastUploadAt);
  if (!Number.isFinite(last)) return true;
  return args.now.getTime() - last >= LIVE_MAX_UPLOAD_AGE_MS;
}

/** Keeps the most recent `keep` uploaded values (used to detect changes). */
export function pruneUploaded(
  uploaded: Readonly<Record<string, number>>,
  today: string,
  keep = 7
): Record<string, number> {
  const cutoff = addDays(today, -(keep - 1));
  const out: Record<string, number> = {};
  for (const [date, steps] of Object.entries(uploaded)) if (date >= cutoff) out[date] = steps;
  return out;
}
