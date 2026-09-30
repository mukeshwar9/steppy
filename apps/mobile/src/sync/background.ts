/**
 * Background sync registration, imported by index.ts before registerRootComponent so the task
 * definition and the HealthKit observer exist when the OS launches the app headlessly.
 */
import "./background-task";
import { resumeBackgroundSync } from "./engine";

export function startBackgroundSync(): void {
  void resumeBackgroundSync().catch(() => undefined);
}
