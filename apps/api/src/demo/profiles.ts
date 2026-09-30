/** Deterministic synthetic step profiles for demo users. */
import { createHash } from "node:crypto";

export type StepProfile = { base: number; weekendFactor: number; restRate: number };

export const DEMO_PASSWORD = "steppy-demo";
export const DEMO_GROUP_NAME = "Steppy Demo";
/** Name of the private group every /auth/demo guest owns. */
export const DEMO_GUEST_GROUP_NAME = "Demo group";
export const DEMO_CAPTAIN = { email: "demo@steppy.app", displayName: "Captain Steppy", profile: { base: 9000, weekendFactor: 1.1, restRate: 0.04 } };

export const SYNTHETIC_USERS: Array<{ email: string; displayName: string; profile: StepProfile }> = [
  { email: "ava@demo.steppy.app", displayName: "Ava", profile: { base: 12800, weekendFactor: 1.15, restRate: 0.05 } },
  { email: "ben@demo.steppy.app", displayName: "Ben", profile: { base: 6800, weekendFactor: 1.35, restRate: 0.08 } },
  { email: "chloe@demo.steppy.app", displayName: "Chloe", profile: { base: 9800, weekendFactor: 0.9, restRate: 0.04 } },
  { email: "dev@demo.steppy.app", displayName: "Dev", profile: { base: 7600, weekendFactor: 2.0, restRate: 0.1 } },
  { email: "eli@demo.steppy.app", displayName: "Eli", profile: { base: 5200, weekendFactor: 1.2, restRate: 0.12 } }
];

function hash32(text: string): number {
  return createHash("sha256").update(text).digest().readUInt32BE(0);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Profile for a demo account: fixed for the named accounts, derived from the id otherwise. */
export function profileFor(user: { id: string; email: string }): StepProfile {
  if (user.email === DEMO_CAPTAIN.email) return DEMO_CAPTAIN.profile;
  const synthetic = SYNTHETIC_USERS.find((u) => u.email === user.email);
  if (synthetic) return synthetic.profile;
  const rng = mulberry32(hash32(user.id));
  return { base: Math.round(5000 + rng() * 6000), weekendFactor: 0.9 + rng() * 0.8, restRate: 0.04 + rng() * 0.06 };
}

/** Full-day step total of `date` (YYYY-MM-DD) for a profile, stable across runs. */
export function dayTotal(profile: StepProfile, key: string, date: string): number {
  const rng = mulberry32(hash32(`${key}:${date}`));
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const weekend = dow === 0 || dow === 6;
  if (rng() < profile.restRate) return Math.round(1200 + rng() * 1800);
  const factor = weekend ? profile.weekendFactor : 1;
  return Math.round(profile.base * factor * (0.75 + rng() * 0.5));
}

/** Relative walking intensity at a minute of the local day: none at night, peaks morning and evening. */
export function minuteWeight(minuteOfDay: number): number {
  const hour = minuteOfDay / 60;
  if (hour < 6.5 || hour >= 22.5) return 0;
  const bump = (centre: number, width: number): number => Math.exp(-(((hour - centre) / width) ** 2));
  return 1 + 0.8 * bump(8, 1.2) + 0.4 * bump(12.5, 1) + 0.8 * bump(18, 1.5);
}

const cumulative: number[] = [];
{
  let sum = 0;
  for (let m = 0; m < 1440; m++) {
    sum += minuteWeight(m);
    cumulative.push(sum);
  }
}
export const TOTAL_WEIGHT = cumulative[1439] as number;

/** Share of the day's steps normally done by the end of `minuteOfDay` (0..1439). */
export function cumulativeFraction(minuteOfDay: number): number {
  return (cumulative[Math.min(1439, Math.max(0, Math.floor(minuteOfDay)))] as number) / TOTAL_WEIGHT;
}

const minuteFormatters = new Map<string, Intl.DateTimeFormat>();

/** Minutes since local midnight of `now` in `timeZone`. */
export function localMinuteOfDay(now: Date, timeZone: string): number {
  let f = minuteFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
    minuteFormatters.set(timeZone, f);
  }
  let h = 0;
  let m = 0;
  for (const p of f.formatToParts(now)) {
    if (p.type === "hour") h = Number(p.value) % 24;
    if (p.type === "minute") m = Number(p.value);
  }
  return h * 60 + m;
}
