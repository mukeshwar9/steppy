import { AppState } from "react-native";
import { QueryClient, focusManager } from "@tanstack/react-query";
import { ApiError } from "./http";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2
    }
  }
});

// Refetch stale queries when the app returns to the foreground.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (state) => handleFocus(state === "active"));
  return () => sub.remove();
});
