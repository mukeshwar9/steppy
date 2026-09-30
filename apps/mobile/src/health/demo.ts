/**
 * Deterministic on-device synthetic step provider (source DEMO). Pure: no native modules.
 * Steps for a past date are a function of hash(userId + date); today's value scales with the
 * elapsed fraction of the local day.
 */
import { addDays, dateRange, localDateInZone } from "@steppy/core";
import type { StepDay } from "@steppy/core";

/** FNV-1a 32-bit hash. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 = Sunday .. 6 = Saturday for a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Full-day demo total for a date (what a finished day would show). */
export function demoFullDaySteps(userId: string, date: string): number {
  // Per-user baseline 5500..10500 steps.
  const base = 5500 + (hashString(`${userId}:baseline`) % 5001);
  const rnd = seededRandom(hashString(`${userId}:${date}`));
  const weekday = weekdayOf(date);
  const weekend = weekday === 0 || weekday === 6;
  const roll = rnd();
  const noise = 0.65 + rnd() * 0.75; // 0.65..1.4
  let steps: number;
  if (roll < 0.06) {
    // Rest day.
    steps = 1200 + rnd() * 2400;
  } else if (roll > 0.95) {
    // Big day (hike, long run).
    steps = base * (1.5 + rnd() * 0.7);
  } else {
    steps = base * noise * (weekend ? 0.8 + rnd() * 0.5 : 1);
  }
  return Math.max(500, Math.min(35_000, Math.round(steps)));
}

/** Fraction (0..1) of the local day elapsed at `now` in `timeZone`. */
export function dayFraction(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const seconds = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  return Math.min(1, Math.max(0, seconds / 86_400));
}

/** Demo steps for `date`; `today` is scaled by `todayFraction`, future dates are 0. */
export function demoSteps(userId: string, date: string, today: string, todayFraction: number): number {
  if (date > today) return 0;
  const full = demoFullDaySteps(userId, date);
  return date === today ? Math.round(full * Math.min(1, Math.max(0, todayFraction))) : full;
}

/** Demo StepDay[] for the given dates as of `now` in `timeZone`. */
export function demoDays(userId: string, dates: string[], now: Date, timeZone: string): StepDay[] {
  const today = localDateInZone(now, timeZone);
  const fraction = dayFraction(now, timeZone);
  return dates.map(date => ({ date, steps: demoSteps(userId, date, today, fraction) }));
}

/** Demo StepDay[] for the last `days` days ending today (today partial). */
export function demoHistory(userId: string, days: number, now: Date, timeZone: string): StepDay[] {
  const today = localDateInZone(now, timeZone);
  return demoDays(userId, dateRange(addDays(today, -(days - 1)), today), now, timeZone);
}
