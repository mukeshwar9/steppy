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

/** missing: nothing stored (or unparseable, so unusable); error: the keychain could not be read. */
export type ReadResult<T> = { status: "ok"; value: T } | { status: "missing" } | { status: "error" };

/** Thrown when the saved session cannot be read from the keychain (for example a locked device). Never means "signed out". */
export class SessionReadError extends Error {
  constructor() {
    super("Couldn't read your saved session. Try again in a moment.");
    this.name = "SessionReadError";
  }
}

async function readJson<T>(key: string): Promise<ReadResult<T>> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(key, STORE_OPTIONS);
  } catch {
    return { status: "error" };
  }
  if (!raw) return { status: "missing" };
  try {
    return { status: "ok", value: JSON.parse(raw) as T };
  } catch {
    return { status: "missing" };
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
/** True once a keychain read succeeded. A failed read is never cached, so it is retried. */
let loaded = false;

/**
 * Loads the stored session once. Safe to call repeatedly and from background tasks. A keychain
 * read error is not cached (the next call retries) and leaves the stored tokens untouched; the
 * store still flips to `hydrated` so the UI is not stuck on the splash screen.
 */
export function hydrateSession(): Promise<void> {
  if (!hydration) {
    const run = (async () => {
      const [tokens, user] = await Promise.all([readJson<Tokens>(TOKENS_KEY), readJson<User>(USER_KEY)]);
      if (tokens.status === "error" || user.status === "error") {
        hydration = null;
        useSession.setState({ hydrated: true });
        return;
      }
      loaded = true;
      if (tokens.status === "ok" && tokens.value.accessToken && tokens.value.refreshToken && user.status === "ok") {
        useSession.setState({
          hydrated: true,
          accessToken: tokens.value.accessToken,
          refreshToken: tokens.value.refreshToken,
          user: user.value
        });
      } else {
        useSession.setState({ hydrated: true });
      }
    })();
    hydration = run;
  }
  return hydration;
}

/** Hydrates and throws SessionReadError when the keychain could not be read. */
async function ensureLoaded(): Promise<void> {
  await hydrateSession();
  if (!loaded && !useSession.getState().accessToken) throw new SessionReadError();
}

export async function setSession(auth: AuthResponse): Promise<void> {
  loaded = true;
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
 * Returns "error" when the keychain could not be read (callers must keep the session then).
 */
export async function reloadTokensFromStorage(): Promise<Tokens | null | "error"> {
  const result = await readJson<Tokens>(TOKENS_KEY);
  if (result.status === "error") return "error";
  if (result.status === "ok" && result.value.accessToken && result.value.refreshToken) {
    const tokens = result.value;
    const current = useSession.getState();
    if (current.accessToken !== tokens.accessToken || current.refreshToken !== tokens.refreshToken) {
      useSession.setState({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    }
    return tokens;
  }
  return null;
}

/** Id of the signed-in user, or null when signed out. Works outside React. Throws SessionReadError on a keychain read error. */
export async function getCurrentUserId(): Promise<string | null> {
  await ensureLoaded();
  return useSession.getState().user?.id ?? null;
}

export async function getAccessToken(): Promise<string | null> {
  await ensureLoaded();
  return useSession.getState().accessToken;
}
