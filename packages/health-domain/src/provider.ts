export type HealthProviderType =
  | "DEVELOPER"
  | "APPLE_HEALTH"
  | "HEALTH_CONNECT"
  | "FITBIT"
  | "GARMIN"
  | "ZEPP"
  | "SAMSUNG_HEALTH";

export type PermissionResult = { granted: boolean; read: string[]; denied?: string[] };
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "PERMISSION_REQUIRED" | "ERROR";
export type DateRange = { earliest: string; latest: string };
export type DailyStepRecord = {
  localDate: string;
  timezone: string;
  steps: number;
  distanceMeters?: number;
  activeMinutes?: number;
  caloriesKcal?: number;
  sourceDevice?: string;
  sourceRecordId?: string;
  recordedAt?: string;
};
export type SyncOptions = { startDate: Date; endDate: Date; cursor?: string | null };
export type SyncResult = { records: DailyStepRecord[]; nextCursor?: string | null; hasMore: boolean };

export interface HealthProvider {
  readonly provider: HealthProviderType;
  requestPermissions(): Promise<PermissionResult>;
  getConnectionStatus(): Promise<ConnectionStatus>;
  getAvailableDateRange(): Promise<DateRange | null>;
  getDailySteps(startDate: Date, endDate: Date): Promise<DailyStepRecord[]>;
  sync(options: SyncOptions): Promise<SyncResult>;
  disconnect(): Promise<void>;
}
