import type { RealtimeEvents } from "@steppy/core";
import { queryClient } from "../api/queryClient";
import { createBatcher } from "../lib/debounce";
import { keyId, keysForRealtimeEvent, type QueryKey } from "../lib/queryKeys";

const batcher = createBatcher<QueryKey>(500, keyId, (keys) => {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
});

/** Debounced (~500 ms) invalidation of the queries a realtime event affects. */
export function handleRealtimeEvent<K extends keyof RealtimeEvents>(event: K, payload: RealtimeEvents[K]): void {
  batcher.push(keysForRealtimeEvent(event, payload));
}

/** Debounced invalidation after this device uploaded steps. */
export function invalidateKeys(keys: QueryKey[]): void {
  batcher.push(keys);
}
