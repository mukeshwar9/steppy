import { BadRequestException } from "@nestjs/common";

const cache = new Map<string, boolean>();

export function isValidTimezone(tz: string): boolean {
  const cached = cache.get(tz);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    ok = false;
  }
  cache.set(tz, ok);
  return ok;
}

export function assertTimezone(tz: string): string {
  if (!isValidTimezone(tz)) throw new BadRequestException(`Invalid timezone: ${tz}`);
  return tz;
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
export function isValidLocalDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
