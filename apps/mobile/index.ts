import { registerRootComponent } from "expo";
import App from "./App";
import { startBackgroundSync } from "./src/sync/background";

// Task definitions and the HealthKit observer must exist before the app component renders,
// so the OS can run background syncs when it launches the app headlessly.
startBackgroundSync();

registerRootComponent(App);
