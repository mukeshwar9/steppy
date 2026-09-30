/** Pure: splits a day's total into realistic step samples across waking hours (dev sample data). */
import { hashString, seededRandom } from "./demo";

export type SampleChunk = { date: string; startMinute: number; endMinute: number; count: number };

/**
 * Splits `total` steps of `date` into 6..10 samples between 07:00 and 22:00.
 * Counts sum exactly to `total`. Deterministic for (seed, date).
 */
export function splitIntoSamples(seed: string, date: string, total: number): SampleChunk[] {
  const rnd = seededRandom(hashString(`${seed}:${date}:samples`));
  const n = 6 + Math.floor(rnd() * 5);
  const weights = Array.from({ length: n }, () => 0.3 + rnd());
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const windowStart = 7 * 60;
  const windowEnd = 22 * 60;
  const slot = Math.floor((windowEnd - windowStart) / n);
  let remaining = total;
  return weights.map((w, i) => {
    const count = i === n - 1 ? remaining : Math.min(remaining, Math.round((total * w) / weightSum));
    remaining -= count;
    const startMinute = windowStart + i * slot + Math.floor(rnd() * Math.max(1, slot / 4));
    const endMinute = Math.min(windowEnd, startMinute + Math.max(10, Math.floor(slot * (0.4 + rnd() * 0.4))));
    return { date, startMinute, endMinute, count };
  });
}
