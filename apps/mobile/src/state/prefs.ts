/** Small persisted flags (onboarding done per user), stored in expo-secure-store. */
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const KEY = "steppy.onboarded";
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

type PrefsState = { hydrated: boolean; onboarded: string[] };

export const usePrefs = create<PrefsState>(() => ({ hydrated: false, onboarded: [] }));

let hydration: Promise<void> | null = null;

export function hydratePrefs(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      let onboarded: string[] = [];
      try {
        const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) onboarded = parsed.filter((v): v is string => typeof v === "string");
      } catch {
        // start fresh
      }
      usePrefs.setState({ hydrated: true, onboarded });
    })();
  }
  return hydration;
}

export async function markOnboarded(userId: string): Promise<void> {
  const current = usePrefs.getState().onboarded;
  if (current.includes(userId)) return;
  const next = [...current, userId].slice(-20);
  usePrefs.setState({ onboarded: next });
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(next), OPTIONS);
  } catch {
    // flag stays in memory for this run
  }
}

/** Forgets the onboarding flag of a user (account deletion). */
export async function unmarkOnboarded(userId: string): Promise<void> {
  const current = usePrefs.getState().onboarded;
  if (!current.includes(userId)) return;
  const next = current.filter(id => id !== userId);
  usePrefs.setState({ onboarded: next });
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(next), OPTIONS);
  } catch {
    // flag is gone from memory for this run
  }
}
