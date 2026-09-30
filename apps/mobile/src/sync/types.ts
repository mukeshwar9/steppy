import type { StepSource } from "@steppy/core";

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
