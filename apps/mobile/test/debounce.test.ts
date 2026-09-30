import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBatcher } from "../src/lib/debounce";

describe("createBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces a burst into one flush with deduplicated items", () => {
    const flush = vi.fn();
    const batcher = createBatcher<string>(500, (s) => s, flush);
    batcher.push(["a", "b"]);
    vi.advanceTimersByTime(200);
    batcher.push(["b", "c"]);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("starts a new batch after a flush", () => {
    const flush = vi.fn();
    const batcher = createBatcher<string>(500, (s) => s, flush);
    batcher.push(["a"]);
    vi.advanceTimersByTime(500);
    batcher.push(["a"]);
    vi.advanceTimersByTime(500);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("cancel drops pending items", () => {
    const flush = vi.fn();
    const batcher = createBatcher<string>(500, (s) => s, flush);
    batcher.push(["a"]);
    batcher.cancel();
    vi.advanceTimersByTime(1000);
    expect(flush).not.toHaveBeenCalled();
  });
});
