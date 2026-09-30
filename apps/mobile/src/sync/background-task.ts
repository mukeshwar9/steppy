/**
 * Periodic background sync (Android WorkManager, iOS BGTask) via expo-background-task.
 * The task is defined at module top level; index.ts imports this before registerRootComponent.
 */
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

export const BACKGROUND_SYNC_TASK = "steppy-health-sync";
const MINIMUM_INTERVAL_MINUTES = 15;

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    // Lazy so this module stays cheap to import and avoids an import cycle with the engine.
    const { backgroundSync } = require("./engine") as typeof import("./engine");
    const ok = await backgroundSync();
    return ok ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundTask(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) return;
  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: MINIMUM_INTERVAL_MINUTES });
}

export async function unregisterBackgroundTask(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  }
}
