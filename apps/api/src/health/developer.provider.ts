import type { ConnectionStatus, DailyStepRecord, DateRange, HealthProvider, PermissionResult, SyncOptions, SyncResult } from "@steppy/health-domain";
import { addDays } from "../common/date.js";

export class DeveloperHealthProvider implements HealthProvider {
  readonly provider = "DEVELOPER" as const;
  private connected = true;
  async requestPermissions(): Promise<PermissionResult> { return { granted: true, read: ["steps", "walking_running_distance"] }; }
  async getConnectionStatus(): Promise<ConnectionStatus> { return this.connected ? "CONNECTED" : "DISCONNECTED"; }
  async getAvailableDateRange(): Promise<DateRange> {
    const end = new Date().toISOString().slice(0, 10); const start = new Date(); start.setUTCFullYear(start.getUTCFullYear() - 5);
    return { earliest: start.toISOString().slice(0, 10), latest: end };
  }
  async getDailySteps(startDate: Date, endDate: Date): Promise<DailyStepRecord[]> {
    const start = startDate.toISOString().slice(0, 10), end = endDate.toISOString().slice(0, 10), rows: DailyStepRecord[] = [];
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const seed = this.seed(date); const steps = seed % 41 === 0 ? 0 : seed % 31 === 0 ? 30000 + seed % 5000 : Math.max(500, 8000 + (seed % 8001) - 4000);
      rows.push({ localDate: date, timezone: "UTC", steps, distanceMeters: Math.round(steps * 0.72), activeMinutes: Math.round(steps / 100), sourceDevice: "Developer Simulator", sourceRecordId: `dev-${date}`, recordedAt: `${date}T23:59:59.000Z` });
    }
    return rows;
  }
  async sync(options: SyncOptions): Promise<SyncResult> { return { records: await this.getDailySteps(options.startDate, options.endDate), nextCursor: null, hasMore: false }; }
  async disconnect(): Promise<void> { this.connected = false; }
  private seed(value: string): number { let result = 0; for (const char of value) result = (result * 31 + char.charCodeAt(0)) % 100000; return result; }
}
