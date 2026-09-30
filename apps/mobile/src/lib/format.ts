import type { StepSource } from "@steppy/core";

/** 12345 -> "12,345". Deterministic (no Intl). */
export function formatSteps(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function sourceLabel(source: StepSource | null | undefined): string {
  switch (source) {
    case "HEALTHKIT":
      return "Apple Health";
    case "HEALTH_CONNECT":
      return "Health Connect";
    case "DEMO":
      return "Demo";
    default:
      return "No source yet";
  }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

/** "Mon" for a YYYY-MM-DD date. */
export function weekdayShort(date: string): string {
  const { y, m, d } = parts(date);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()] ?? "";
}

/** "Oct 1" */
export function formatDayMonth(date: string): string {
  const { m, d } = parts(date);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
}

/** "Oct 1 – Oct 7" */
export function formatWindow(startDate: string, endDate: string): string {
  return `${formatDayMonth(startDate)} – ${formatDayMonth(endDate)}`;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
