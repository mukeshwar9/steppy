/** Sync engine: reads daily totals from the connected source and uploads them. No React here. */
import Constants from "expo-constants";
import { AppState } from "react-native";
import { localDateInZone } from "@steppy/core";
import type { StepDay, StepSource, SyncReason, UploadStepsResponse } from "@steppy/core";
import { uploadSteps } from "../api/client";
import { getCurrentUserId } from "../api/session";
import {
  HealthUnavailableError,
  availableSources as platformSources,
  deviceTimezone,
  disableSourceBackground,
  enableSourceBackground,
  errorMessage,
  isHistoryLimited,
  observeSource,
  readDays,
  requestAccess,
  writeSamples
} from "../health";
import {
  LIMITED_HISTORY_DAYS,
  clipDates,
  effectiveReason,
  hasChanges,
  isFullSyncReason,
  isLiveUploadDue,
  planDates,
  pruneUploaded,
  selectUploadDays
} from "./plan";
import {
  clearPersisted,
  ensureHydrated,
  getHydratedUserId,
  getPersisted,
  getSyncState,
  resetMemory,
  setSyncState,
  updatePersisted
} from "./store";
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

/** Bumped on sign-out: a sync that started earlier aborts at its next checkpoint. */
let epoch = 0;

class SyncAbortedError extends Error {
  constructor() {
    super("Sync cancelled.");
    this.name = "SyncAbortedError";
  }
}

/** Throws unless the same user is still signed in (and the sync state is theirs) and no sign-out happened. */
async function assertCurrent(userId: string, myEpoch: number, source?: StepSource): Promise<void> {
  if (epoch !== myEpoch) throw new SyncAbortedError();
  const current = await getCurrentUserId();
  if (epoch !== myEpoch || current !== userId || getHydratedUserId() !== userId) throw new SyncAbortedError();
  if (source && getPersisted().source !== source) throw new SyncAbortedError();
}

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
  const myEpoch = epoch;
  return start(reason).catch(error => {
    if (error instanceof SyncAbortedError || epoch !== myEpoch) return;
    setSyncState(failureState(error));
  });
}

async function runSync(reason: SyncReason): Promise<void> {
  const myEpoch = epoch;
  const userId = await ensureHydrated();
  const persisted = getPersisted();
  const source = persisted.source;
  if (!userId || !source) return;
  await assertCurrent(userId, myEpoch, source);

  const timeZone = deviceTimezone();
  const now = new Date();
  const today = localDateInZone(now, timeZone);
  const lastFullSyncDate = persisted.lastFullSyncAt ? localDateInZone(new Date(persisted.lastFullSyncAt), timeZone) : null;
  let dates = planDates({ reason, today, backfillDone: persisted.backfillDone, lastFullSyncDate });
  // Only long reads can hit a history limit; skip the permission lookup for the 60 s live ticks.
  let limited: boolean | null = null;
  if (dates.length > 3) {
    limited = await isHistoryLimited(source).catch(() => false);
    if (limited) dates = clipDates(dates, today, LIMITED_HISTORY_DAYS);
  }
  const sendReason = effectiveReason(reason, persisted.backfillDone);
  const quiet = reason === "live";
  if (!quiet) setSyncState({ status: "syncing", lastError: null });

  const days = await readDays(source, dates, userId, timeZone, now);
  await assertCurrent(userId, myEpoch, source);
  const todaySteps = days.find(d => d.date === today)?.steps ?? null;

  if (reason === "live") {
    const due = isLiveUploadDue({ changed: hasChanges(days, persisted.lastUploaded), lastUploadAt: persisted.lastUploadAt, now });
    const current = getSyncState().status;
    setSyncState({ todaySteps, ...(current === "error" || current === "unavailable" ? { status: "idle" as const, lastError: null } : {}) });
    if (!due) return;
  }

  // HealthKit never reports a denied read: it just returns zeros. A long read with no steps at all
  // is not uploaded (beyond yesterday/today) and does not finish the backfill, so it retries.
  const { upload: uploadDays, empty } = selectUploadDays(days, today);
  const backfillEmpty = empty && !persisted.backfillDone;
  const response = await uploadSteps({ source, timezone: timeZone, reason: sendReason, days: uploadDays }, userId);
  await assertCurrent(userId, myEpoch, source);

  const uploaded = { ...persisted.lastUploaded };
  for (const d of uploadDays) uploaded[d.date] = d.steps;
  const backfillDone = persisted.backfillDone || (sendReason === "backfill" && !backfillEmpty);
  const noStepsFound = sendReason === "backfill" ? backfillEmpty : persisted.noStepsFound && !backfillDone;
  const historyLimited = limited ?? persisted.historyLimited;
  const lastFullSyncAt = isFullSyncReason(reason) ? now.toISOString() : persisted.lastFullSyncAt;
  await updatePersisted({
    lastSyncedAt: response.lastSyncedAt,
    lastFullSyncAt,
    lastUploadAt: new Date().toISOString(),
    lastUploaded: pruneUploaded(uploaded, today),
    backfillDone,
    noStepsFound,
    historyLimited,
    todaySteps
  });
  setSyncState({ status: "idle", lastError: null, lastSyncedAt: response.lastSyncedAt, backfillDone, noStepsFound, historyLimited, todaySteps });
  for (const l of [...listeners]) l(response);
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
  const myEpoch = epoch;
  try {
    setSyncState({ status: "syncing", lastError: null });
    await requestAccess(source);
    await assertCurrent(userId, myEpoch);
    const previous = getPersisted().source;
    if (previous && previous !== source) await disableSourceBackground(previous).catch(() => undefined);
    await updatePersisted({
      source,
      backfillDone: false,
      lastSyncedAt: null,
      lastFullSyncAt: null,
      noStepsFound: false,
      historyLimited: false,
      lastUploaded: {},
      lastUploadAt: null,
      todaySteps: null
    });
    setSyncState({ source, backfillDone: false, lastSyncedAt: null, noStepsFound: false, historyLimited: false, todaySteps: null });
    await enableBackground(source);
    // Wait for any running sync, then run (or re-run) the backfill for the new source.
    if (inflight) await inflight;
    await start("backfill");
  } catch (error) {
    if (!(error instanceof SyncAbortedError)) setSyncState(failureState(error));
    throw error;
  }
}

let lastObserved = 0;
const OBSERVER_MIN_GAP_MS = 10_000;

/**
 * HealthKit observer callback. It fires on every sample batch, so while the app is open it goes
 * through the throttled live path; only when not active does it take the background path.
 * Callbacks that carry an error are ignored.
 */
function onSourceChanged(errorMessage?: string): void {
  if (errorMessage) return;
  if (AppState.currentState === "active") {
    const at = Date.now();
    if (at - lastObserved < OBSERVER_MIN_GAP_MS) return;
    lastObserved = at;
    void syncNow("live");
    return;
  }
  void backgroundSync();
}

/** Enables background sync for the source (HealthKit delivery + periodic background task). */
export async function enableBackground(source: StepSource): Promise<void> {
  if (source === "DEMO") {
    await registerBackgroundTask().catch(() => undefined);
    return;
  }
  await enableSourceBackground(source).catch(() => undefined);
  observeSource(source, onSourceChanged);
  await registerBackgroundTask().catch(() => undefined);
}

/** Re-attaches the HealthKit observer after a launch (called from index.ts). */
export async function resumeBackgroundSync(): Promise<void> {
  const userId = await ensureHydrated();
  const source = getPersisted().source;
  if (!userId || !source) return;
  observeSource(source, onSourceChanged);
}

export async function disconnectSource(): Promise<void> {
  await ensureHydrated();
  const source = getPersisted().source;
  await disableSourceBackground(source).catch(() => undefined);
  await unregisterBackgroundTask().catch(() => undefined);
  await updatePersisted({
    source: null,
    backfillDone: false,
    lastFullSyncAt: null,
    noStepsFound: false,
    historyLimited: false,
    lastUploaded: {},
    lastUploadAt: null,
    todaySteps: null
  });
  setSyncState({
    status: "not-connected",
    source: null,
    backfillDone: false,
    noStepsFound: false,
    historyLimited: false,
    todaySteps: null,
    lastError: null
  });
}

/**
 * Sign-out: stops native observers and the background task, cancels the in-flight sync and drops
 * the in-memory state. The user's persisted state stays so signing back in resumes their source.
 */
export async function suspendSync(): Promise<void> {
  epoch += 1;
  await ensureHydrated().catch(() => undefined);
  const source = getPersisted().source;
  await disableSourceBackground(source).catch(() => undefined);
  await unregisterBackgroundTask().catch(() => undefined);
  if (inflight) {
    // Its writes are guarded by the epoch; do not make sign-out wait for a slow network call.
    await Promise.race([inflight, new Promise<void>(resolve => setTimeout(resolve, 2_000))]);
  }
  resetMemory();
}

/** Sign-in: loads that user's persisted sync state and re-enables background sync for their source. */
export async function resumeForUser(): Promise<void> {
  const userId = await ensureHydrated();
  const source = getPersisted().source;
  if (!userId || !source) return;
  await enableBackground(source);
}

/** Account deletion: stops sync like sign-out and also erases the user's persisted sync state. */
export async function eraseSyncState(userId: string | null): Promise<void> {
  try {
    await suspendSync();
  } finally {
    await clearPersisted(userId);
  }
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
  // Not connected yet: connecting runs the 90-day backfill over the new samples. Already connected: a pull
  // re-reads the recent window (and any unfinished backfill); older settled days that already hold a
  // non-zero value stay frozen on the server.
  if (connected) await syncNow("pull");
  else await connectSource(source);
}
