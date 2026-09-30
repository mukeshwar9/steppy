import type { StepSource } from "@steppy/core";

/** Shown when a backfill read found no steps at all (HealthKit never says when read access is denied). */
export function noStepsHint(source: StepSource | null): string {
  if (source === "HEALTH_CONNECT") {
    return "No steps found. Check that Health Connect allows Steppy to read Steps.";
  }
  return "No steps found. Check Health > Sharing > Apps > Steppy allows Steps.";
}

/** Shown when Health Connect history access is missing, so only the last 30 days were imported. */
export const LIMITED_HISTORY_NOTE =
  "Only the last 30 days could be imported; allow history access in Health Connect to import 90 days.";
