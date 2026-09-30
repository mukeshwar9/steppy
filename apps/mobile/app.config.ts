import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Write permissions and usage strings exist only for the development helper
 * `writeSampleHealthData()`. Build with STEPPY_PRODUCTION=1 to leave them out.
 */
const isProduction = process.env.STEPPY_PRODUCTION === "1";

const HEALTH_READ_PERMISSIONS = [
  "android.permission.health.READ_STEPS",
  // Needed to read more than 30 days before the user granted access (90-day backfill).
  "android.permission.health.READ_HEALTH_DATA_HISTORY",
  // Needed for the periodic background sync while the app is closed.
  "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"
];
const HEALTH_WRITE_PERMISSIONS = ["android.permission.health.WRITE_STEPS"];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Steppy",
  slug: "steppy",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "steppy",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.steppy.app",
    infoPlist: { ITSAppUsesNonExemptEncryption: false }
  },
  android: {
    package: "com.steppy.app",
    permissions: isProduction ? HEALTH_READ_PERMISSIONS : [...HEALTH_READ_PERMISSIONS, ...HEALTH_WRITE_PERMISSIONS]
  },
  plugins: [
    "expo-secure-store",
    "expo-web-browser",
    "react-native-health-connect",
    [
      "expo-build-properties",
      {
        android: { minSdkVersion: 26, compileSdkVersion: 36, targetSdkVersion: 36 }
      }
    ],
    [
      "@kingstinct/react-native-healthkit",
      {
        background: true,
        NSHealthShareUsageDescription: "Steppy reads your daily step count from Apple Health to rank you against your friends.",
        // `false` keeps NSHealthUpdateUsageDescription out of production builds (nothing is ever written there).
        NSHealthUpdateUsageDescription: isProduction
          ? false
          : "Steppy writes sample step data to Apple Health in development builds only."
      }
    ],
    "expo-background-task"
  ],
  extra: {
    ...config.extra,
    steppyDev: !isProduction
  }
});
