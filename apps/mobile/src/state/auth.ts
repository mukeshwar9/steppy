import { api } from "../api/client";
import { queryClient } from "../api/queryClient";
import { clearSession, setSession } from "../api/session";
import { disconnectRealtime } from "../realtime/socket";
import { deviceTimezone } from "../lib/tz";
import { resetSyncState } from "../sync";

export async function signIn(email: string, password: string): Promise<void> {
  queryClient.clear();
  await setSession(await api.login({ email, password }));
}

export async function signUp(displayName: string, email: string, password: string): Promise<void> {
  queryClient.clear();
  await setSession(await api.register({ displayName, email, password, timezone: deviceTimezone() }));
}

export async function signInDemo(): Promise<void> {
  queryClient.clear();
  await setSession(await api.demoLogin({ timezone: deviceTimezone() }));
}

export async function signOut(): Promise<void> {
  disconnectRealtime();
  try {
    await resetSyncState();
  } catch {
    // never block sign-out on the sync engine
  }
  await clearSession();
  queryClient.clear();
}
