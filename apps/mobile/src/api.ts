import * as SecureStore from "expo-secure-store";
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await SecureStore.getItemAsync("steppy.accessToken");
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init.headers } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? `Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> { await SecureStore.setItemAsync("steppy.accessToken", accessToken); await SecureStore.setItemAsync("steppy.refreshToken", refreshToken); }
export async function signOut(): Promise<void> {
  const refreshToken = await SecureStore.getItemAsync("steppy.refreshToken");
  if (refreshToken) await api("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  await SecureStore.deleteItemAsync("steppy.accessToken"); await SecureStore.deleteItemAsync("steppy.refreshToken");
}
