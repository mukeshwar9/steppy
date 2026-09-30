/**
 * Collects items (deduplicated by `keyOf`) and flushes them together after `delayMs` of quiet
 * time since the first push of a batch. Used to coalesce bursts of realtime events.
 */
export function createBatcher<T>(delayMs: number, keyOf: (item: T) => string, flush: (items: T[]) => void) {
  const pending = new Map<string, T>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    timer = null;
    const items = [...pending.values()];
    pending.clear();
    if (items.length > 0) flush(items);
  };

  return {
    push(items: T[]) {
      for (const item of items) pending.set(keyOf(item), item);
      if (timer === null && pending.size > 0) timer = setTimeout(run, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending.clear();
    }
  };
}
