import { aggregateGroupByPeriod, initialize, requestPermission } from "react-native-health-connect";

export type HealthConnectDailyRecord = { localDate: string; timezone: string; steps: number };
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
function localDateAt(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export async function readHealthConnectHistory(onProgress: (progress: number) => void): Promise<HealthConnectDailyRecord[]> {
  if (!(await initialize())) throw new Error("Health Connect is unavailable on this Android device");
  const granted = await requestPermission([{ accessType: "read", recordType: "Steps" }]);
  if (!granted.some(permission => permission.accessType === "read" && permission.recordType === "Steps")) throw new Error("Step permission was not granted");
  const end = new Date(); const start = new Date(); start.setFullYear(end.getFullYear() - 5);
  const groups = await aggregateGroupByPeriod({ recordType: "Steps", timeRangeFilter: { operator: "between", startTime: start.toISOString(), endTime: end.toISOString() }, timeRangeSlicer: { period: "DAYS", length: 1 } });
  const records = groups.map(group => ({ localDate: localDateAt(group.startTime), timezone, steps: Math.max(0, Math.round(group.result.COUNT_TOTAL ?? 0)) }));
  onProgress(100);
  return records;
}
