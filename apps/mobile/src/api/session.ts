/**
 * Persisted session (tokens and user) backed by expo-secure-store, exposed as a zustand store.
 * Everything here works outside React too (background tasks): call hydrateSession() or use the
 * async helpers, which hydrate on demand.
 */
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import type { AuthResponse, User } from "@steppy/core";

const TOKENS_KEY = "steppy.tokens";
const USER_KEY = "steppy.user";
// Background tasks run while the device is locked, so keep items readable after first unlock.
const STORE_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export type Tokens = { accessToken: string; refreshToken: string };

type SessionState = {
  hydrated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
};

export const useSession = create<SessionState>(() => ({
  hydrated: false,
  accessToken: null,
  refreshToken: null,
  user: null
}));

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key, STORE_OPTIONS);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value), STORE_OPTIONS);
  } catch {
    // Keep the in-memory session usable even if the keychain write fails.
  }
}

async function deleteKey(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, STORE_OPTIONS);
  } catch {
    // ignore
  }
}

let hydration: Promise<void> | null = null;

/** Loads the stored session once. Safe to call repeatedly and from background tasks. */
export function hydrateSession(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      const [tokens, user] = await Promise.all([readJson<Tokens>(TOKENS_KEY), readJson<User>(USER_KEY)]);
      if (tokens?.accessToken && tokens.refreshToken && user) {
        useSession.setState({ hydrated: true, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user });
      } else {
        useSession.setState({ hydrated: true });
      }
    })();
  }
  return hydration;
}

export async function setSession(auth: AuthResponse): Promise<void> {
  useSession.setState({
    hydrated: true,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    user: auth.user
  });
  await Promise.all([
    writeJson(TOKENS_KEY, { accessToken: auth.accessToken, refreshToken: auth.refreshToken }),
    writeJson(USER_KEY, auth.user)
  ]);
}

export async function updateStoredUser(user: User): Promise<void> {
  if (!useSession.getState().accessToken) return;
  useSession.setState({ user });
  await writeJson(USER_KEY, user);
}

export async function clearSession(): Promise<void> {
  useSession.setState({ hydrated: true, accessToken: null, refreshToken: null, user: null });
  await Promise.all([deleteKey(TOKENS_KEY), deleteKey(USER_KEY)]);
}

/**
 * Re-reads tokens from the keychain. Another JS context (a background task) may have refreshed
 * them since this one loaded; refresh tokens rotate, so adopt the newest pair before refreshing.
 */
export async function reloadTokensFromStorage(): Promise<Tokens | null> {
  const tokens = await readJson<Tokens>(TOKENS_KEY);
  if (tokens?.accessToken && tokens.refreshToken) {
    const current = useSession.getState();
    if (current.accessToken !== tokens.accessToken || current.refreshToken !== tokens.refreshToken) {
      useSession.setState({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    }
    return tokens;
  }
  return null;
}

/** Id of the signed-in user, or null when signed out. Works outside React. */
export async function getCurrentUserId(): Promise<string | null> {
  await hydrateSession();
  return useSession.getState().user?.id ?? null;
}

export async function getAccessToken(): Promise<string | null> {
  await hydrateSession();
  return useSession.getState().accessToken;
}
