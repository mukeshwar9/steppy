/** Sync engine: reads daily totals from the connected source and uploads them. No React here. */
import Constants from "expo-constants";
import { localDateInZone } from "@steppy/core";
import type { StepDay, StepSource, SyncReason, UploadStepsResponse } from "@steppy/core";
import { uploadSteps } from "../api/client";
import {
  HealthUnavailableError,
  availableSources as platformSources,
  deviceTimezone,
  disableSourceBackground,
  enableSourceBackground,
  errorMessage,
  observeSource,
  readDays,
  requestAccess,
  writeSamples
} from "../health";
import { effectiveReason, hasChanges, isLiveUploadDue, planDates, pruneUploaded } from "./plan";
import { clearPersisted, ensureHydrated, getPersisted, getSyncState, setSyncState, updatePersisted } from "./store";
import { registerBackgroundTask, unregisterBackgroundTask } from "./background-task";

const listeners = new Set<(response: UploadStepsResponse) => void>();

export function availableSources(): StepSource[] {
  return platformSources();
}

export function onSynced(listener: (response: UploadStepsResponse) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function failureState(error: unknown) {
  return {
    status: error instanceof HealthUnavailableError ? ("unavailable" as const) : ("error" as const),
    lastError: errorMessage(error)
  };
}

let inflight: Promise<void> | null = null;

/** Starts a sync and registers it as the single in-flight run. Rejects on failure. */
function start(reason: SyncReason): Promise<void> {
  const run = runSync(reason).finally(() => {
    inflight = null;
  });
  inflight = run.catch(() => undefined);
  return run;
}

/** Single-flight: a call while a sync runs joins the running one. Never throws; errors land in state. */
export function syncNow(reason: SyncReason): Promise<void> {
  if (inflight) return inflight;
  return start(reason).catch(error => {
    setSyncState(failureState(error));
  });
}

async function runSync(reason: SyncReason): Promise<void> {
  const userId = await ensureHydrated();
  const persisted = getPersisted();
  const source = persisted.source;
  if (!userId || !source) return;

  const timeZone = deviceTimezone();
  const now = new Date();
  const today = localDateInZone(now, timeZone);
  const lastSyncedDate = persisted.lastSyncedAt ? localDateInZone(new Date(persisted.lastSyncedAt), timeZone) : null;
  const dates = planDates({ reason, today, backfillDone: persisted.backfillDone, lastSyncedDate });
  const sendReason = effectiveReason(reason, persisted.backfillDone);
  const quiet = reason === "live";
  if (!quiet) setSyncState({ status: "syncing", lastError: null });

  const days = await readDays(source, dates, userId, timeZone, now);
  const todaySteps = days.find(d => d.date === today)?.steps ?? null;

  if (reason === "live") {
    const due = isLiveUploadDue({ changed: hasChanges(days, persisted.lastUploaded), lastUploadAt: persisted.lastUploadAt, now });
    const current = getSyncState().status;
    setSyncState({ todaySteps, ...(current === "error" || current === "unavailable" ? { status: "idle" as const, lastError: null } : {}) });
    if (!due) return;
  }

  const response = await upload(source, timeZone, sendReason, days);
  const uploaded = { ...persisted.lastUploaded };
  for (const d of days) uploaded[d.date] = d.steps;
  const fullBackfill = dates.length >= 90 || sendReason === "backfill";
  const backfillDone = persisted.backfillDone || fullBackfill;
  await updatePersisted({
    lastSyncedAt: response.lastSyncedAt,
    lastUploadAt: new Date().toISOString(),
    lastUploaded: pruneUploaded(uploaded, today),
    backfillDone,
    todaySteps
  });
  setSyncState({ status: "idle", lastError: null, lastSyncedAt: response.lastSyncedAt, backfillDone, todaySteps });
  for (const l of [...listeners]) l(response);
}

async function upload(source: StepSource, timezone: string, reason: SyncReason, days: StepDay[]): Promise<UploadStepsResponse> {
  return uploadSteps({ source, timezone, reason, days });
}

/** Background runs (iOS observer, WorkManager/BGTask). Returns false when the sync failed. */
export async function backgroundSync(): Promise<boolean> {
  await syncNow("background");
  const { status } = getSyncState();
  return status !== "error" && status !== "unavailable";
}

export async function connectSource(source: StepSource): Promise<void> {
  const userId = await ensureHydrated();
  if (!userId) throw new Error("Sign in before connecting a step source.");
  if (!platformSources().includes(source)) throw new Error(`${source} is not available on this device.`);
  try {
    setSyncState({ status: "syncing", lastError: null });
    await requestAccess(source);
    const previous = getPersisted().source;
    if (previous && previous !== source) await disableSourceBackground(previous).catch(() => undefined);
    await updatePersisted({ source, backfillDone: false, lastSyncedAt: null, lastUploaded: {}, lastUploadAt: null, todaySteps: null });
    setSyncState({ source, backfillDone: false, lastSyncedAt: null, todaySteps: null });
    await enableBackground(source);
    // Wait for any running sync, then run (or re-run) the backfill for the new source.
    if (inflight) await inflight;
    await start("backfill");
  } catch (error) {
    setSyncState(failureState(error));
    throw error;
  }
}

/** Enables background sync for the source (HealthKit delivery + periodic background task). */
export async function enableBackground(source: StepSource): Promise<void> {
  if (source === "DEMO") {
    await registerBackgroundTask().catch(() => undefined);
    return;
  }
  await enableSourceBackground(source).catch(() => undefined);
  observeSource(source, () => void backgroundSync());
  await registerBackgroundTask().catch(() => undefined);
}

/** Re-attaches the HealthKit observer after a launch (called from index.ts). */
export async function resumeBackgroundSync(): Promise<void> {
  const userId = await ensureHydrated();
  const source = getPersisted().source;
  if (!userId || !source) return;
  observeSource(source, () => void backgroundSync());
}

export async function disconnectSource(): Promise<void> {
  await ensureHydrated();
  const source = getPersisted().source;
  await disableSourceBackground(source).catch(() => undefined);
  await unregisterBackgroundTask().catch(() => undefined);
  await updatePersisted({ source: null, backfillDone: false, lastUploaded: {}, lastUploadAt: null, todaySteps: null });
  setSyncState({ status: "not-connected", source: null, backfillDone: false, todaySteps: null, lastError: null });
}

export async function resetSyncState(): Promise<void> {
  const source = getPersisted().source;
  await disableSourceBackground(source).catch(() => undefined);
  await unregisterBackgroundTask().catch(() => undefined);
  await clearPersisted();
}

/** True in every build that was not made with STEPPY_PRODUCTION=1 (app.config.ts sets `extra.steppyDev`). */
export const STEPPY_DEV = Constants.expoConfig?.extra?.steppyDev === true;

export async function writeSampleHealthData(): Promise<void> {
  const userId = await ensureHydrated();
  if (!userId) throw new Error("Sign in first.");
  if (!STEPPY_DEV) throw new Error("Writing sample health data is only available in development builds.");
  const connected = getPersisted().source;
  if (connected === "DEMO") throw new Error("Sample data can only be written to HealthKit or Health Connect, not the DEMO source.");
  const source = connected ?? platformSources().find(s => s !== "DEMO");
  if (!source) throw new Error("This device has no health store to write sample data to.");
  await writeSamples(source, userId, new Date(), deviceTimezone());
  // Not connected yet: connecting runs the 90-day backfill over the new samples. Already connected: days
  // older than today's settle window were uploaded (as 0) at connect time and are frozen on the server,
  // so only the recent days pick the samples up.
  if (connected) await syncNow("pull");
  else await connectSource(source);
}
