/**
 * Public interface of the health sync engine (owned by src/sync and src/health).
 * Screens use only these exports; the implementation reads HealthKit / Health Connect
 * (or the on-device demo generator) and uploads daily totals with uploadSteps().
 */
import type { StepSource, SyncReason, UploadStepsResponse } from "@steppy/core";

export type SyncStatus = "idle" | "syncing" | "error" | "not-connected" | "unavailable";

export type SyncState = {
  status: SyncStatus;
  /** Source the user connected on this device, null when not connected. */
  source: StepSource | null;
  /** Last successful upload from this device. */
  lastSyncedAt: string | null;
  lastError: string | null;
  /** True once the 90-day backfill for the connected source has uploaded. */
  backfillDone: boolean;
  /** Today's steps as last read from the device store, null if unknown. */
  todaySteps: number | null;
};

/** Sources this platform can offer: iOS -> HEALTHKIT, Android -> HEALTH_CONNECT; DEMO everywhere. */
export function availableSources(): StepSource[] {
  throw new Error("not implemented");
}

/** React hook with the current sync state; re-renders on change. */
export function useSyncState(): SyncState {
  throw new Error("not implemented");
}

/** Requests read permission, runs the 90-day backfill upload and enables background sync. */
export async function connectSource(source: StepSource): Promise<void> {
  throw new Error("not implemented");
}

/** Stops syncing on this device (keeps server data). */
export async function disconnectSource(): Promise<void> {
  throw new Error("not implemented");
}

/** Re-reads recent days (today and the last 2 days, or missing backfill) and uploads them. */
export async function syncNow(reason: SyncReason): Promise<void> {
  throw new Error("not implemented");
}

/**
 * Mount once while signed in: full refresh when the app opens or returns to the foreground,
 * then a re-read and upload every 60 s while the app stays active.
 */
export function useForegroundSync(): void {
  throw new Error("not implemented");
}

/** Called after each successful upload, e.g. to invalidate leaderboard queries. Returns unsubscribe. */
export function onSynced(listener: (response: UploadStepsResponse) => void): () => void {
  throw new Error("not implemented");
}

/**
 * Development helper: writes 90 days of realistic sample step data into HealthKit (iOS Simulator)
 * or Health Connect, so the real read path can be tested without a device. Throws for DEMO.
 */
export async function writeSampleHealthData(): Promise<void> {
  throw new Error("not implemented");
}

/** Clears local sync state on sign-out. */
export async function resetSyncState(): Promise<void> {
  throw new Error("not implemented");
}
