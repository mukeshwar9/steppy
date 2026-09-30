import { io, type Socket } from "socket.io-client";
import type { RealtimeEvents } from "@steppy/core";
import { API_URL } from "../api/config";
import { refreshSession } from "../api/http";
import { useSession } from "../api/session";
import { handleRealtimeEvent } from "./invalidate";

let socket: Socket | null = null;
let unsubscribeSession: (() => void) | null = null;
let lastRefreshAttempt = 0;

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
  s.on("connect_error", (error: Error) => {
    // Middleware rejections stop auto-reconnect; refresh the token and try again (at most every 10 s).
    if (!looksUnauthorized(error.message) || Date.now() - lastRefreshAttempt < 10_000) return;
    lastRefreshAttempt = Date.now();
    void refreshSession(useSession.getState().accessToken)
      .then((ok) => {
        if (ok && socket === s) s.connect();
      })
      .catch(() => undefined);
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
