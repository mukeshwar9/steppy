/** iOS HealthKit access (daily statistics only; never raw samples). Import only on iOS. */
import * as HK from "@kingstinct/react-native-healthkit";
import type { StepDay } from "@steppy/core";
import { HealthUnavailableError } from "./errors";
import { healthKitBucketsToTotals, localMidnight, queryWindow, toStepDays } from "./map";
import { splitIntoSamples } from "./samples";
import { demoSteps } from "./demo";

const STEP_COUNT = "HKQuantityTypeIdentifierStepCount" as const;

export async function requestHealthKitRead(): Promise<void> {
  if (!(await HK.isHealthDataAvailableAsync())) {
    throw new HealthUnavailableError("Apple Health is not available on this device.");
  }
  await HK.requestAuthorization({ toRead: [STEP_COUNT] });
}

/** Daily step totals via HKStatisticsCollectionQuery (cumulativeSum, 1-day buckets at local midnight). */
export async function readHealthKitDays(dates: string[], timeZone: string): Promise<StepDay[]> {
  const { start, end } = queryWindow(dates);
  const buckets = await HK.queryStatisticsCollectionForQuantity(STEP_COUNT, ["cumulativeSum"], start, { day: 1 }, {
    unit: "count",
    filter: { date: { startDate: start, endDate: end } }
  });
  return toStepDays(dates, healthKitBucketsToTotals(buckets, timeZone));
}

/** Background delivery (hourly) plus native launch-time observer registration. */
export async function enableHealthKitBackgroundDelivery(): Promise<void> {
  try {
    await HK.configureBackgroundTypes([STEP_COUNT], HK.UpdateFrequency.hourly);
  } catch {
    // Older native module: fall back to plain enableBackgroundDelivery below.
  }
  await HK.enableBackgroundDelivery(STEP_COUNT, HK.UpdateFrequency.hourly);
}

export async function disableHealthKitBackgroundDelivery(): Promise<void> {
  try {
    await HK.disableBackgroundDelivery(STEP_COUNT);
    await HK.clearBackgroundTypes();
  } catch {
    // Best effort.
  }
}

type Subscription = { remove: () => void };
let observer: Subscription | null = null;

/** Registers the HKObserverQuery listener (idempotent). The native side completes the HealthKit handler. */
export function subscribeToStepChanges(onChange: () => void): void {
  if (observer) return;
  observer = HK.subscribeToChanges(STEP_COUNT, () => onChange());
}

export function unsubscribeFromStepChanges(): void {
  observer?.remove();
  observer = null;
}

/** Dev helper: writes demo-like samples for the days of `dates` (today is clipped to `now`). */
export async function writeHealthKitSamples(userId: string, dates: string[], today: string, now: Date, nowFraction: number): Promise<void> {
  await HK.requestAuthorization({ toShare: [STEP_COUNT], toRead: [STEP_COUNT] });
  const jobs: Array<{ start: Date; end: Date; count: number }> = [];
  for (const date of dates) {
    const total = demoSteps(userId, date, today, date === today ? nowFraction : 1);
    const midnight = localMidnight(date);
    for (const chunk of splitIntoSamples(userId, date, total)) {
      if (chunk.count <= 0) continue;
      const start = new Date(midnight.getTime() + chunk.startMinute * 60_000);
      const end = new Date(midnight.getTime() + chunk.endMinute * 60_000);
      if (end.getTime() > now.getTime()) continue;
      jobs.push({ start, end, count: chunk.count });
    }
  }
  const concurrency = 8;
  for (let i = 0; i < jobs.length; i += concurrency) {
    await Promise.all(
      jobs.slice(i, i + concurrency).map(j => HK.saveQuantitySample(STEP_COUNT, "count", j.count, j.start, j.end))
    );
  }
}
