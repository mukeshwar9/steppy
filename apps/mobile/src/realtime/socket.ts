import { io, type Socket } from "socket.io-client";
import type { RealtimeEvents } from "@steppy/core";
import { API_URL } from "../api/config";
import { refreshSession } from "../api/http";
import { authRetryDelay } from "../api/refreshPolicy";
import { useSession } from "../api/session";
import { handleRealtimeEvent } from "./invalidate";

let socket: Socket | null = null;
let unsubscribeSession: (() => void) | null = null;
let lastRefreshAttempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Consecutive failed auth-recovery attempts; drives the backoff and resets on connect. */
let authFailures = 0;

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function looksUnauthorized(message: string): boolean {
  return /unauthor|jwt|token|expired|forbidden|401/i.test(message);
}

/** Connects (once) to `${API_URL}/realtime` with the current access token. */
export function connectRealtime(): void {
  if (!useSession.getState().accessToken) return;
  if (socket) {
    if (!socket.connected && !socket.active) socket.connect();
    return;
  }
  const s = io(`${API_URL}/realtime`, {
    // A function is re-evaluated on every (re)connection attempt, so a refreshed token is always used.
    auth: (cb) => cb({ token: useSession.getState().accessToken ?? "" }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelayMax: 30_000
  });
  socket = s;

  s.on("steps.updated", (payload: RealtimeEvents["steps.updated"]) => handleRealtimeEvent("steps.updated", payload));
  s.on("group.updated", (payload: RealtimeEvents["group.updated"]) => handleRealtimeEvent("group.updated", payload));
  // Middleware rejections stop socket.io's auto-reconnect, so recover here: refresh the token and
  // reconnect. Attempts are throttled, but a throttled or failed attempt is rescheduled (with
  // backoff) instead of dropped, so realtime comes back once the token is good again.
  const scheduleRecovery = () => {
    if (retryTimer || socket !== s) return;
    const delay = authRetryDelay(authFailures, Date.now() - lastRefreshAttempt);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (socket !== s || s.connected) return;
      lastRefreshAttempt = Date.now();
      authFailures += 1;
      refreshSession(useSession.getState().accessToken)
        .then((ok) => {
          if (ok && socket === s) s.connect(); // a further rejection re-enters connect_error
        })
        .catch(() => {
          if (socket === s) scheduleRecovery(); // network or server trouble: try again later
        });
    }, delay);
  };
  s.on("connect", () => {
    authFailures = 0;
    clearRetry();
  });
  s.on("connect_error", (error: Error) => {
    if (looksUnauthorized(error.message)) scheduleRecovery();
  });

  // Reconnect with the new token whenever the session's access token changes (refresh).
  unsubscribeSession?.();
  unsubscribeSession = useSession.subscribe((state, prev) => {
    if (socket !== s || state.accessToken === prev.accessToken || !state.accessToken) return;
    s.disconnect();
    s.connect();
  });
}

export function disconnectRealtime(): void {
  unsubscribeSession?.();
  unsubscribeSession = null;
  clearRetry();
  authFailures = 0;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/** Ask the server to re-join group rooms after creating, joining or leaving a group. */
export function resubscribeGroups(): void {
  if (socket?.connected) socket.emit("groups.resubscribe", {});
}
