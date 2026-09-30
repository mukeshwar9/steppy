/** Low-level fetch wrapper: bearer auth, one refresh-and-retry on 401, typed errors. Works outside React. */
import type { AuthResponse } from "@steppy/core";
import { API_URL } from "./config";
import { errorMessageFromBody } from "./errorMessage";
import { afterRefreshRejection, isRefreshRejection } from "./refreshPolicy";
import { SessionReadError, clearSession, getAccessToken, hydrateSession, reloadTokensFromStorage, setSession, useSession } from "./session";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TIMEOUT_MS = 20_000;

type RequestOptions = {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Send the bearer token and refresh on 401 (default true). */
  auth?: boolean;
  /** Only send as this user: aborts with 401 if another account is signed in by the time the request goes out. */
  asUser?: string;
};

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  let url = `${API_URL}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function send(method: string, path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    return await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ApiError(0, aborted ? "The server took too long to respond." : `Can't reach the server at ${API_URL}.`);
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, errorMessageFromBody(body, `Request failed (${response.status})`));
  }
  return body as T;
}

let refreshing: Promise<boolean> | null = null;

/**
 * Gets a fresh access token. Single flight. Returns true when the session holds a usable token.
 * Clears the session only when the server rejects the refresh token and the keychain holds no
 * newer one. Network errors, 429, 5xx and keychain read errors keep the session (and throw).
 */
export function refreshSession(failedAccessToken?: string | null): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh(failedAccessToken ?? null).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function doRefresh(failedAccessToken: string | null): Promise<boolean> {
  await hydrateSession();
  const stored = await reloadTokensFromStorage();
  if (stored === "error") throw new SessionReadError();
  const refreshToken = stored?.refreshToken ?? useSession.getState().refreshToken;
  if (!refreshToken) {
    await clearSession();
    return false;
  }
  if (failedAccessToken && stored && stored.accessToken !== failedAccessToken) return true; // someone else refreshed
  try {
    const response = await send("POST", "/auth/refresh", { body: { refreshToken }, auth: false }, null);
    const auth = await parse<AuthResponse>(response);
    await setSession(auth);
    return true;
  } catch (error) {
    if (error instanceof ApiError && isRefreshRejection(error.status)) {
      const action = afterRefreshRejection({ usedRefreshToken: refreshToken, stored: await reloadTokensFromStorage() });
      if (action === "adopt-stored") return true; // reloadTokensFromStorage already put the newer pair in the session
      if (action === "clear-session") {
        await clearSession();
        return false;
      }
    }
    throw error;
  }
}

function assertUser(asUser: string | undefined): void {
  if (asUser !== undefined && useSession.getState().user?.id !== asUser) {
    throw new ApiError(401, "Signed in as a different user.");
  }
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const auth = opts.auth !== false;
  const token = auth ? await getAccessToken() : null;
  if (auth && !token) throw new ApiError(401, "You are signed out.");
  if (auth) assertUser(opts.asUser);
  let response = await send(method, path, opts, token);
  if (auth && response.status === 401) {
    const ok = await refreshSession(token);
    if (!ok) throw new ApiError(401, "Your session expired. Please sign in again.");
    assertUser(opts.asUser);
    response = await send(method, path, opts, useSession.getState().accessToken);
  }
  return parse<T>(response);
}
