/** Pure decisions for the token refresh flow (no native modules, unit tested). */

/**
 * True when the server definitively rejected the refresh token (400/401/403). Everything else
 * (network failure, 429, 5xx, other 4xx) is transient: the session must be kept.
 */
export function isRefreshRejection(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

export type RefreshRejectionAction = "adopt-stored" | "clear-session" | "keep-session";

/**
 * After the server rejected `usedRefreshToken`. Refresh tokens rotate, so a foreground/background
 * race can reject a token that another context already replaced: if the keychain now holds a
 * different refresh token, adopt it. Clear the session only when the stored token is the one the
 * server rejected (or nothing is stored). A keychain read error keeps the session.
 */
export function afterRefreshRejection(args: {
  usedRefreshToken: string;
  stored: { refreshToken: string } | null | "error";
}): RefreshRejectionAction {
  const { usedRefreshToken, stored } = args;
  if (stored === "error") return "keep-session";
  if (stored && stored.refreshToken !== usedRefreshToken) return "adopt-stored";
  return "clear-session";
}

const REFRESH_THROTTLE_MS = 10_000;
const BACKOFF_BASE_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;

/**
 * Delay before the next realtime auth-recovery attempt: never sooner than the 10 s throttle
 * window after the previous attempt, and growing (5 s, 10 s, 20 s ... up to 60 s) with consecutive failures.
 */
export function authRetryDelay(failures: number, sinceLastAttemptMs: number): number {
  const throttle = Math.max(0, REFRESH_THROTTLE_MS - sinceLastAttemptMs);
  const backoff = failures <= 0 ? 0 : Math.min(MAX_RETRY_DELAY_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
  return Math.max(throttle, backoff);
}
