import { api } from "../api/client";
import { queryClient } from "../api/queryClient";
import { clearSession, getCurrentUserId, setSession } from "../api/session";
import { disconnectRealtime } from "../realtime/socket";
import { deviceTimezone } from "../lib/tz";
import { eraseSyncState, resumeSyncForUser, suspendSync } from "../sync";
import { unmarkOnboarded } from "./prefs";

async function startSession(auth: Awaited<ReturnType<typeof api.login>>): Promise<void> {
  queryClient.clear();
  await setSession(auth);
  // Re-enable background sync for this user's saved source, if they have one. Never blocks sign-in.
  void resumeSyncForUser().catch(() => undefined);
}

export async function signIn(email: string, password: string): Promise<void> {
  await startSession(await api.login({ email, password }));
}

export async function signUp(displayName: string, email: string, password: string): Promise<void> {
  await startSession(await api.register({ displayName, email, password, timezone: deviceTimezone() }));
}

export async function signInDemo(): Promise<void> {
  await startSession(await api.demoLogin({ timezone: deviceTimezone() }));
}

/** Stops everything tied to the signed-in user on this device. */
async function stopUserWork(erase: { userId: string | null } | null): Promise<void> {
  disconnectRealtime();
  try {
    // Cancels the in-flight sync and stops observers and the background task. The user's saved sync
    // state stays (so signing back in resumes their source) unless the account is being deleted.
    if (erase) await eraseSyncState(erase.userId);
    else await suspendSync();
  } catch {
    // never block sign-out on the sync engine
  }
  await clearSession();
  queryClient.clear();
}

export async function signOut(): Promise<void> {
  await stopUserWork(null);
}

/** Deletes the account on the server (DELETE /me), then cleans up like sign-out and forgets this user's local state. */
export async function deleteAccount(): Promise<void> {
  const userId = await getCurrentUserId();
  await api.deleteMe();
  await stopUserWork({ userId });
  if (userId) await unmarkOnboarded(userId);
}
