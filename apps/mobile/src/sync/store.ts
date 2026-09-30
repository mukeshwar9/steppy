/**
 * Sync state: an in-memory subscribable store mirrored per user into expo-secure-store so
 * background runs and restarts pick it up.
 */
import * as SecureStore from "expo-secure-store";
import type { StepSource } from "@steppy/core";
import { getCurrentUserId } from "../api/session";
import type { SyncState } from "./types";

export type PersistedSync = {
  v: 1;
  source: StepSource | null;
  lastSyncedAt: string | null;
  backfillDone: boolean;
  /** Values last uploaded per local date (recent days only), used to detect changes. */
  lastUploaded: Record<string, number>;
  lastUploadAt: string | null;
  todaySteps: number | null;
};

const EMPTY: PersistedSync = {
  v: 1,
  source: null,
  lastSyncedAt: null,
  backfillDone: false,
  lastUploaded: {},
  lastUploadAt: null,
  todaySteps: null
};

const INITIAL_STATE: SyncState = {
  status: "not-connected",
  source: null,
  lastSyncedAt: null,
  lastError: null,
  backfillDone: false,
  todaySteps: null
};

// AFTER_FIRST_UNLOCK so background runs can read it while the phone is locked.
const STORE_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const keyFor = (userId: string) => `steppy.sync.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;

let state: SyncState = INITIAL_STATE;
let persisted: PersistedSync = EMPTY;
/** undefined = never hydrated (or cleared); null = hydrated while signed out. */
let hydratedUserId: string | null | undefined;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSyncState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSyncState(patch: Partial<SyncState>): void {
  const next = { ...state, ...patch };
  if ((Object.keys(next) as Array<keyof SyncState>).every(k => next[k] === state[k])) return;
  state = next;
  for (const l of [...listeners]) l();
}

export function getPersisted(): PersistedSync {
  return persisted;
}

function parsePersisted(raw: string | null): PersistedSync {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSync>;
    if (parsed.v !== 1) return EMPTY;
    return { ...EMPTY, ...parsed, lastUploaded: parsed.lastUploaded ?? {} };
  } catch {
    return EMPTY;
  }
}

function stateFromPersisted(p: PersistedSync): SyncState {
  return {
    status: p.source ? "idle" : "not-connected",
    source: p.source,
    lastSyncedAt: p.lastSyncedAt,
    lastError: null,
    backfillDone: p.backfillDone,
    todaySteps: p.todaySteps
  };
}

async function load(userId: string | null): Promise<void> {
  const raw = userId ? await SecureStore.getItemAsync(keyFor(userId), STORE_OPTIONS).catch(() => null) : null;
  persisted = parsePersisted(raw);
  hydratedUserId = userId;
  state = stateFromPersisted(persisted);
  for (const l of [...listeners]) l();
}

/** Loads the signed-in user's persisted state (reloads when the user changed). Returns the user id. */
export async function ensureHydrated(): Promise<string | null> {
  const userId = await getCurrentUserId();
  while (hydrating) await hydrating;
  if (userId === hydratedUserId) return userId;
  hydrating = load(userId).finally(() => {
    hydrating = null;
  });
  await hydrating;
  return userId;
}

/** Merges into persisted state, writes it, and mirrors public fields into the in-memory state. */
export async function updatePersisted(patch: Partial<PersistedSync>): Promise<void> {
  persisted = { ...persisted, ...patch };
  if (hydratedUserId) {
    await SecureStore.setItemAsync(keyFor(hydratedUserId), JSON.stringify(persisted), STORE_OPTIONS).catch(() => undefined);
  }
}

/** Removes persisted state of the last hydrated user and resets memory. */
export async function clearPersisted(): Promise<void> {
  const userId = hydratedUserId ?? (await getCurrentUserId().catch(() => null));
  if (userId) await SecureStore.deleteItemAsync(keyFor(userId), STORE_OPTIONS).catch(() => undefined);
  persisted = EMPTY;
  hydratedUserId = undefined;
  state = INITIAL_STATE;
  for (const l of [...listeners]) l();
}
