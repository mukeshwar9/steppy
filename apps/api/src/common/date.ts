export function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
export function eachDate(start: string, end: string): string[] {
  const result: string[] = []; for (let date = start; date <= end; date = addDays(date, 1)) result.push(date); return result;
}
export function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
