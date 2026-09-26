export type ActivityLike = { localDate: string; steps: number; distanceMeters?: number | null };
export type ActivityStats = {
  lifetimeSteps: number; stepsThisYear: number; stepsThisMonth: number; stepsThisWeek: number;
  averageDailySteps: number; averageWeekdaySteps: number; averageWeekendSteps: number;
  bestDay: ActivityLike | null; bestWeek: { week: string; steps: number } | null;
  bestMonth: { month: string; steps: number } | null; longest10kStreak: number; current10kStreak: number;
  daysOver10k: number; daysOver20k: number; annualTotals: Record<string, number>; monthlyTotals: Record<string, number>;
  estimatedDistanceMeters: number;
};

function dateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 };
}
function dayOfWeek(date: string): number { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
function isoWeek(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const thursday = new Date(d); thursday.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return `${thursday.getUTCFullYear()}-${String(Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)).padStart(2, "0")}`;
}

export function calculateStats(records: ActivityLike[], now = new Date()): ActivityStats {
  const sorted = [...records].sort((a, b) => a.localDate.localeCompare(b.localDate));
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const year = String(now.getUTCFullYear());
  const today = now.toISOString().slice(0, 10);
  const weekStart = new Date(now); weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const weekStartDate = weekStart.toISOString().slice(0, 10);
  const annualTotals: Record<string, number> = {}, monthlyTotals: Record<string, number> = {}, weeks: Record<string, number> = {};
  let weekdayTotal = 0, weekdayCount = 0, weekendTotal = 0, weekendCount = 0, distance = 0;
  for (const record of sorted) {
    const { year: y, month } = dateParts(record.localDate); const monthKey = `${y}-${String(month).padStart(2, "0")}`;
    annualTotals[y] = (annualTotals[y] ?? 0) + record.steps; monthlyTotals[monthKey] = (monthlyTotals[monthKey] ?? 0) + record.steps;
    weeks[isoWeek(record.localDate)] = (weeks[isoWeek(record.localDate)] ?? 0) + record.steps;
    if (dayOfWeek(record.localDate) === 0 || dayOfWeek(record.localDate) === 6) { weekendTotal += record.steps; weekendCount++; } else { weekdayTotal += record.steps; weekdayCount++; }
    distance += record.distanceMeters ?? 0;
  }
  let longest = 0, run = 0, currentRun = 0, previous: string | null = null;
  for (const record of sorted) {
    const day = new Date(`${record.localDate}T12:00:00Z`);
    const contiguous = previous !== null && (day.getTime() - new Date(`${previous}T12:00:00Z`).getTime()) === 86400000;
    run = record.steps >= 10000 ? (contiguous ? run + 1 : 1) : 0; longest = Math.max(longest, run);
    if (record.localDate <= today && record.steps >= 10000) currentRun = contiguous ? currentRun + 1 : 1;
    else if (record.localDate <= today) currentRun = 0;
    previous = record.localDate;
  }
  const bestDay = sorted.length ? sorted.reduce((best, record) => record.steps > best.steps ? record : best) : null;
  const bestWeek = Object.entries(weeks).sort((a, b) => b[1] - a[1])[0];
  const bestMonth = Object.entries(monthlyTotals).sort((a, b) => b[1] - a[1])[0];
  return {
    lifetimeSteps: sorted.reduce((sum, r) => sum + r.steps, 0),
    stepsThisYear: sorted.filter(r => r.localDate.startsWith(year)).reduce((sum, r) => sum + r.steps, 0),
    stepsThisMonth: sorted.filter(r => r.localDate.startsWith(current)).reduce((sum, r) => sum + r.steps, 0),
    stepsThisWeek: sorted.filter(r => r.localDate >= weekStartDate && r.localDate <= today).reduce((sum, r) => sum + r.steps, 0),
    averageDailySteps: sorted.length ? Math.round(sorted.reduce((sum, r) => sum + r.steps, 0) / sorted.length) : 0,
    averageWeekdaySteps: weekdayCount ? Math.round(weekdayTotal / weekdayCount) : 0,
    averageWeekendSteps: weekendCount ? Math.round(weekendTotal / weekendCount) : 0,
    bestDay, bestWeek: bestWeek ? { week: bestWeek[0], steps: bestWeek[1] } : null, bestMonth: bestMonth ? { month: bestMonth[0], steps: bestMonth[1] } : null,
    longest10kStreak: longest, current10kStreak: currentRun, daysOver10k: sorted.filter(r => r.steps >= 10000).length, daysOver20k: sorted.filter(r => r.steps >= 20000).length,
    annualTotals, monthlyTotals, estimatedDistanceMeters: distance
  };
}
