/**
 * Public interface of the health sync engine (owned by src/sync and src/health).
 * Screens use only these exports; the implementation reads HealthKit / Health Connect
 * (or the on-device demo generator) and uploads daily totals with uploadSteps().
 */
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import type { StepSource, SyncReason, UploadStepsResponse } from "@steppy/core";
import * as engine from "./engine";
import { LIVE_INTERVAL_MS } from "./plan";
import { ensureHydrated, getSyncState, subscribeSyncState } from "./store";
import type { SyncState, SyncStatus } from "./types";

export type { SyncState, SyncStatus };

/** Sources this platform can offer: iOS -> HEALTHKIT, Android -> HEALTH_CONNECT; DEMO everywhere. */
export function availableSources(): StepSource[] {
  return engine.availableSources();
}

/** React hook with the current sync state; re-renders on change. */
export function useSyncState(): SyncState {
  useEffect(() => {
    void ensureHydrated().catch(() => undefined);
  }, []);
  return useSyncExternalStore(subscribeSyncState, getSyncState, getSyncState);
}

/** Requests read permission, runs the 90-day backfill upload and enables background sync. */
export async function connectSource(source: StepSource): Promise<void> {
  return engine.connectSource(source);
}

/** Stops syncing on this device (keeps server data). */
export async function disconnectSource(): Promise<void> {
  return engine.disconnectSource();
}

/** Re-reads recent days (today and the last 2 days, or missing backfill) and uploads them. */
export async function syncNow(reason: SyncReason): Promise<void> {
  return engine.syncNow(reason);
}

/**
 * Mount once while signed in: full refresh when the app opens or returns to the foreground,
 * then a re-read and upload every 60 s while the app stays active.
 */
export function useForegroundSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const begin = () => {
      stop();
      void engine.syncNow("foreground");
      timer = setInterval(() => void engine.syncNow("live"), LIVE_INTERVAL_MS);
    };
    if (AppState.currentState === "active") begin();
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active") begin();
      else stop();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, []);
}

/** Called after each successful upload, e.g. to invalidate leaderboard queries. Returns unsubscribe. */
export function onSynced(listener: (response: UploadStepsResponse) => void): () => void {
  return engine.onSynced(listener);
}

/**
 * Development helper: writes 90 days of realistic sample step data into HealthKit (iOS Simulator)
 * or Health Connect, so the real read path can be tested without a device. Throws for DEMO.
 */
export async function writeSampleHealthData(): Promise<void> {
  return engine.writeSampleHealthData();
}

/** True when development tools (sample health data) are enabled; false in STEPPY_PRODUCTION builds. */
export const developmentToolsEnabled: boolean = engine.STEPPY_DEV;

/** Clears local sync state on sign-out. */
export async function resetSyncState(): Promise<void> {
  return engine.resetSyncState();
}
