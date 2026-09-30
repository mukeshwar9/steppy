/** Platform dispatch for reading daily step totals from the phone health store. */
import { Platform } from "react-native";
import type { StepDay, StepSource } from "@steppy/core";
import { addDays, dateRange, localDateInZone } from "@steppy/core";
import { HealthUnavailableError } from "./errors";
import { dayFraction, demoDays } from "./demo";

export { HealthUnavailableError, errorMessage } from "./errors";

export function availableSources(): StepSource[] {
  if (Platform.OS === "ios") return ["HEALTHKIT", "DEMO"];
  if (Platform.OS === "android") return ["HEALTH_CONNECT", "DEMO"];
  return ["DEMO"];
}

// Native modules are required lazily so the other platform's bundle never touches them.
function healthKit(): typeof import("./healthkit") {
  if (Platform.OS !== "ios") throw new HealthUnavailableError("Apple Health is only available on iOS.");
  return require("./healthkit");
}
function healthConnect(): typeof import("./healthconnect") {
  if (Platform.OS !== "android") throw new HealthUnavailableError("Health Connect is only available on Android.");
  return require("./healthconnect");
}

export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Requests read access for the source (no-op for DEMO). Throws when unavailable or denied. */
export async function requestAccess(source: StepSource): Promise<void> {
  if (source === "HEALTHKIT") return healthKit().requestHealthKitRead();
  if (source === "HEALTH_CONNECT") return healthConnect().requestHealthConnectRead();
}

/** Reads daily totals for `dates` (contiguous ascending) from the source. */
export async function readDays(source: StepSource, dates: string[], userId: string, timeZone: string, now: Date): Promise<StepDay[]> {
  if (source === "DEMO") return demoDays(userId, dates, now, timeZone);
  if (source === "HEALTHKIT") return healthKit().readHealthKitDays(dates, timeZone);
  return healthConnect().readHealthConnectDays(dates, timeZone);
}

/** Enables platform background delivery for the source (iOS HealthKit hourly delivery). */
export async function enableSourceBackground(source: StepSource): Promise<void> {
  if (source === "HEALTHKIT") {
    const hk = healthKit();
    await hk.enableHealthKitBackgroundDelivery();
  }
}

export async function disableSourceBackground(source: StepSource | null): Promise<void> {
  if (source === "HEALTHKIT") {
    const hk = healthKit();
    hk.unsubscribeFromStepChanges();
    await hk.disableHealthKitBackgroundDelivery();
  }
}

/** Registers the HealthKit observer; `onChange` runs a background sync. No-op elsewhere. */
export function observeSource(source: StepSource, onChange: () => void): void {
  if (source === "HEALTHKIT") healthKit().subscribeToStepChanges(onChange);
}

/** Dev helper: writes 90 days of sample data into the store unless it already has data. */
export async function writeSamples(source: StepSource, userId: string, now: Date, timeZone: string): Promise<void> {
  const today = localDateInZone(now, timeZone);
  const dates = dateRange(addDays(today, -89), today);
  const fraction = dayFraction(now, timeZone);
  await requestAccess(source);
  // Skip when the store already holds step data for most days (writing twice would double the totals).
  const existing = await readDays(source, dates, userId, timeZone, now);
  if (existing.filter(d => d.steps > 0).length >= 30) return;
  if (source === "HEALTHKIT") return healthKit().writeHealthKitSamples(userId, dates, today, now, fraction);
  return healthConnect().writeHealthConnectSamples(userId, dates, today, now, fraction);
}
