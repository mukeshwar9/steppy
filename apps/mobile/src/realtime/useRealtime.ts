import { useEffect } from "react";
import { AppState } from "react-native";
import { useSession } from "../api/session";
import { connectRealtime, disconnectRealtime } from "./socket";

/** Keeps the socket connected while signed in and the app is active; disconnects in the background. */
export function useRealtime(): void {
  const signedIn = useSession((s) => s.accessToken !== null);
  useEffect(() => {
    if (!signedIn) {
      disconnectRealtime();
      return;
    }
    if (AppState.currentState === "active") connectRealtime();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") connectRealtime();
      else disconnectRealtime();
    });
    return () => {
      sub.remove();
      disconnectRealtime();
    };
  }, [signedIn]);
}
