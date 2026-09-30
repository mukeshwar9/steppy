import { useCallback, useEffect, useState } from "react";
import { syncNow } from "../sync";

/** A `Date` that refreshes every `intervalMs`, so "updated X ago" labels stay current. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Pull-to-refresh: push this device's steps first (ignored if not connected), then refetch. */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNow("pull");
    } catch {
      // not connected or offline: still refetch
    }
    try {
      await refetch();
    } catch {
      // surfaced by the query state
    }
    setRefreshing(false);
  }, [refetch]);
  return { refreshing, onRefresh };
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
