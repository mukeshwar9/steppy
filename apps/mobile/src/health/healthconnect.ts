/** Android Health Connect access (aggregates only; never raw records). Import only on Android. */
import {
  SdkAvailabilityStatus,
  aggregateGroupByPeriod,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  requestPermission
} from "react-native-health-connect";
import type { StepDay } from "@steppy/core";
import { HealthUnavailableError } from "./errors";
import { healthConnectGroupsToTotals, localMidnight, queryWindow, toStepDays } from "./map";
import { splitIntoSamples } from "./samples";
import { demoSteps } from "./demo";

const READ_STEPS = { accessType: "read", recordType: "Steps" } as const;
const READ_HISTORY = { accessType: "read", recordType: "ReadHealthDataHistory" } as const;
const READ_BACKGROUND = { accessType: "read", recordType: "BackgroundAccessPermission" } as const;
const WRITE_STEPS = { accessType: "write", recordType: "Steps" } as const;

/** Throws HealthUnavailableError when Health Connect is missing or must be updated. */
export async function ensureHealthConnect(): Promise<void> {
  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) {
    throw new HealthUnavailableError(
      "Health Connect is not installed or not supported on this device. Install it from Google Play, then try again."
    );
  }
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    throw new HealthUnavailableError("Health Connect needs an update. Update it in Google Play, then try again.");
  }
  if (!(await initialize())) {
    throw new HealthUnavailableError("Health Connect could not be initialised on this device.");
  }
}

async function hasStepsRead(): Promise<boolean> {
  const granted = await getGrantedPermissions();
  return granted.some(p => p.accessType === "read" && p.recordType === "Steps");
}

/** Requests read Steps, read history (older than 30 days) and background read. Throws if Steps is denied. */
export async function requestHealthConnectRead(): Promise<void> {
  await ensureHealthConnect();
  try {
    await requestPermission([READ_STEPS, READ_HISTORY, READ_BACKGROUND]);
  } catch {
    // History/background permissions can be unsupported on older Health Connect versions.
    await requestPermission([READ_STEPS]);
  }
  if (!(await hasStepsRead())) {
    throw new HealthUnavailableError("Step permission was not granted. Allow Steps in Health Connect to sync.");
  }
}

/** Daily totals via aggregateGroupByPeriod (1-day slices); Health Connect de-duplicates across apps. */
export async function readHealthConnectDays(dates: string[], timeZone: string): Promise<StepDay[]> {
  await ensureHealthConnect();
  if (!(await hasStepsRead())) {
    throw new HealthUnavailableError("Step permission is missing. Reconnect Health Connect in Steppy.");
  }
  const { start, end } = queryWindow(dates);
  const groups = await aggregateGroupByPeriod({
    recordType: "Steps",
    timeRangeFilter: { operator: "between", startTime: start.toISOString(), endTime: end.toISOString() },
    timeRangeSlicer: { period: "DAYS", length: 1 }
  });
  return toStepDays(dates, healthConnectGroupsToTotals(groups, timeZone));
}

/** Dev helper: writes demo-like Steps records. Needs WRITE_STEPS (development builds only). */
export async function writeHealthConnectSamples(userId: string, dates: string[], today: string, now: Date, nowFraction: number): Promise<void> {
  await ensureHealthConnect();
  await requestPermission([READ_STEPS, WRITE_STEPS]);
  const records: Array<{ recordType: "Steps"; startTime: string; endTime: string; count: number }> = [];
  for (const date of dates) {
    const total = demoSteps(userId, date, today, date === today ? nowFraction : 1);
    const midnight = localMidnight(date);
    for (const chunk of splitIntoSamples(userId, date, total)) {
      if (chunk.count <= 0) continue;
      const start = new Date(midnight.getTime() + chunk.startMinute * 60_000);
      const end = new Date(midnight.getTime() + chunk.endMinute * 60_000);
      if (end.getTime() > now.getTime()) continue;
      records.push({ recordType: "Steps", startTime: start.toISOString(), endTime: end.toISOString(), count: chunk.count });
    }
  }
  for (let i = 0; i < records.length; i += 100) await insertRecords(records.slice(i, i + 100));
}

/** True when background reads are allowed (READ_HEALTH_DATA_IN_BACKGROUND granted). */
export async function hasBackgroundRead(): Promise<boolean> {
  try {
    const granted = await getGrantedPermissions();
    return granted.some(p => p.accessType === "read" && p.recordType === "BackgroundAccessPermission");
  } catch {
    return false;
  }
}
