import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../common/prisma.service.js";
import { AppLogger } from "../common/logger.js";
import { addDays, eachDate, todayInTimezone } from "../common/date.js";
import { ProviderRegistry } from "./provider-registry.js";
import type { HealthProviderType } from "@steppy/health-domain";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService, private readonly providers: ProviderRegistry, private readonly events: EventEmitter2, private readonly logger: AppLogger) {}
  async connections(userId: string) { return this.prisma.healthConnection.findMany({ where: { userId }, select: { id: true, provider: true, status: true, connectedAt: true, lastSyncedAt: true, earliestAvailableDate: true, syncCursor: true } }); }
  async connect(userId: string, provider: HealthProviderType) {
    if (provider === "HEALTH_CONNECT") return this.connectMobileProvider(userId, provider);
    const adapter = this.providers.get(provider); const permissions = await adapter.requestPermissions();
    if (!permissions.granted) throw new BadRequestException("Health read permission was denied");
    const range = await adapter.getAvailableDateRange();
    return this.prisma.healthConnection.upsert({ where: { userId_provider: { userId, provider } }, create: { userId, provider, status: "CONNECTED", connectedAt: new Date(), earliestAvailableDate: range?.earliest }, update: { status: "CONNECTED", connectedAt: new Date(), earliestAvailableDate: range?.earliest } });
  }
  private async connectMobileProvider(userId: string, provider: HealthProviderType) {
    await this.prisma.user.update({ where: { id: userId }, data: { primaryProvider: provider } });
    // Remove synthetic canonical rows when switching from Developer Provider.
    // Health Connect becomes the sole source of truth for subsequent imports.
    if (provider === "HEALTH_CONNECT") await this.prisma.dailyActivity.deleteMany({ where: { userId, primaryProvider: "DEVELOPER" } });
    return this.prisma.healthConnection.upsert({ where: { userId_provider: { userId, provider } }, create: { userId, provider, status: "CONNECTED", connectedAt: new Date() }, update: { status: "CONNECTED", connectedAt: new Date() } });
  }
  async disconnect(userId: string, provider: HealthProviderType) {
    const connection = await this.prisma.healthConnection.findUnique({ where: { userId_provider: { userId, provider } } });
    if (!connection) throw new NotFoundException("Health connection not found");
    if (provider !== "HEALTH_CONNECT") await this.providers.get(provider).disconnect();
    return this.prisma.healthConnection.update({ where: { id: connection.id }, data: { status: "DISCONNECTED" } });
  }
  async startImport(userId: string, provider: HealthProviderType, startDate?: string, endDate?: string) {
    const connection = await this.prisma.healthConnection.findUnique({ where: { userId_provider: { userId, provider } } });
    if (!connection || connection.status !== "CONNECTED") throw new BadRequestException("Connect provider before importing");
    const range = await this.providers.get(provider).getAvailableDateRange();
    const start = startDate ?? connection.earliestAvailableDate ?? range?.earliest; const end = endDate ?? range?.latest;
    if (!start || !end || start > end) throw new BadRequestException("Provider has no importable date range");
    const job = await this.prisma.syncJob.create({ data: { userId, healthConnectionId: connection.id, kind: "HISTORICAL_IMPORT", startDate: start, endDate: end } });
    void this.runImport(job.id, userId, connection.id, provider, start, end);
    return job;
  }
  async getJob(userId: string, jobId: string) { const job = await this.prisma.syncJob.findFirst({ where: { id: jobId, userId } }); if (!job) throw new NotFoundException("Sync job not found"); return job; }
  async ingestMobileRecords(userId: string, provider: HealthProviderType, records: Array<{ localDate: string; timezone: string; steps: number; distanceMeters?: number }>) {
    if (provider !== "HEALTH_CONNECT") throw new BadRequestException("Only Health Connect mobile records are supported");
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { primaryProvider: true } });
    let imported = 0;
    for (const record of records) {
      await this.prisma.activitySourceRecord.upsert({ where: { userId_provider_sourceKey: { userId, provider, sourceKey: `health-connect-${record.localDate}` } }, create: { userId, provider, localDate: record.localDate, timezone: record.timezone, steps: record.steps, distanceMeters: record.distanceMeters, sourceKey: `health-connect-${record.localDate}`, sourceDevice: "Android Health Connect" }, update: { timezone: record.timezone, steps: record.steps, distanceMeters: record.distanceMeters, importedAt: new Date() } });
      if (user.primaryProvider === provider) await this.prisma.dailyActivity.upsert({ where: { userId_localDate: { userId, localDate: record.localDate } }, create: { userId, localDate: record.localDate, timezone: record.timezone, steps: record.steps, distanceMeters: record.distanceMeters, primaryProvider: provider, sourceMetadata: { provider, sourceDevice: "Android Health Connect", importedAt: new Date().toISOString() } }, update: { timezone: record.timezone, steps: record.steps, distanceMeters: record.distanceMeters, primaryProvider: provider, sourceMetadata: { provider, sourceDevice: "Android Health Connect", importedAt: new Date().toISOString() } } });
      imported++;
    }
    this.events.emit("activity.updated", { userId });
    return { imported };
  }
  async simulateSteps(userId: string, steps: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, primaryProvider: true } });
    const localDate = todayInTimezone(user.timezone);
    const activity = await this.prisma.dailyActivity.upsert({ where: { userId_localDate: { userId, localDate } }, create: { userId, localDate, timezone: user.timezone, steps, primaryProvider: "DEVELOPER", sourceMetadata: { provider: "DEVELOPER", sourceDevice: "Developer Simulator", simulated: true } }, update: { steps: { increment: steps }, sourceMetadata: { provider: "DEVELOPER", sourceDevice: "Developer Simulator", simulated: true, updatedAt: new Date().toISOString() } } });
    this.events.emit("activity.updated", { userId });
    return activity;
  }
  async runImport(jobId: string, userId: string, connectionId: string, providerType: HealthProviderType, start: string, end: string): Promise<void> {
    const adapter = this.providers.get(providerType); const started = Date.now();
    const owner = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { primaryProvider: true } });
    try {
      await this.prisma.syncJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: new Date() } });
      let cursor = start, imported = 0; const totalDays = eachDate(start, end).length;
      while (cursor <= end) {
        const batchEnd = [addDays(cursor, 364), end].sort()[0]!;
        const records = await adapter.getDailySteps(new Date(`${cursor}T00:00:00Z`), new Date(`${batchEnd}T23:59:59Z`));
        for (const record of records) {
          await this.prisma.activitySourceRecord.upsert({ where: { userId_provider_sourceKey: { userId, provider: providerType, sourceKey: record.sourceRecordId ?? record.localDate } }, create: { userId, provider: providerType, localDate: record.localDate, timezone: record.timezone, steps: record.steps, distanceMeters: record.distanceMeters, activeMinutes: record.activeMinutes, caloriesKcal: record.caloriesKcal, sourceKey: record.sourceRecordId ?? record.localDate, sourceDevice: record.sourceDevice, recordedAt: record.recordedAt ? new Date(record.recordedAt) : undefined }, update: { localDate: record.localDate, timezone: record.timezone, steps: record.steps, distanceMeters: record.distanceMeters, activeMinutes: record.activeMinutes, caloriesKcal: record.caloriesKcal, sourceDevice: record.sourceDevice, recordedAt: record.recordedAt ? new Date(record.recordedAt) : undefined } });
          if (providerType !== owner.primaryProvider) { imported++; continue; }
          await this.prisma.dailyActivity.upsert({ where: { userId_localDate: { userId, localDate: record.localDate } }, create: { userId, localDate: record.localDate, timezone: record.timezone, steps: record.steps, distanceMeters: record.distanceMeters, activeMinutes: record.activeMinutes, caloriesKcal: record.caloriesKcal, primaryProvider: providerType, sourceMetadata: { provider: providerType, sourceDevice: record.sourceDevice, sourceRecordId: record.sourceRecordId, importedAt: new Date().toISOString() }, sourceUpdatedAt: record.recordedAt ? new Date(record.recordedAt) : undefined }, update: { timezone: record.timezone, steps: record.steps, distanceMeters: record.distanceMeters, activeMinutes: record.activeMinutes, caloriesKcal: record.caloriesKcal, primaryProvider: providerType, sourceMetadata: { provider: providerType, sourceDevice: record.sourceDevice, sourceRecordId: record.sourceRecordId, importedAt: new Date().toISOString() }, sourceUpdatedAt: record.recordedAt ? new Date(record.recordedAt) : undefined } });
          imported++;
        }
        const progress = Math.min(100, Math.round((eachDate(start, batchEnd).length / totalDays) * 100));
        await this.prisma.syncJob.update({ where: { id: jobId }, data: { progress, recordsImported: imported, cursor: batchEnd } });
        cursor = addDays(batchEnd, 1);
      }
      await this.prisma.healthConnection.update({ where: { id: connectionId }, data: { lastSyncedAt: new Date(), syncCursor: end } });
      await this.prisma.syncJob.update({ where: { id: jobId }, data: { status: "SUCCEEDED", progress: 100, recordsImported: imported, completedAt: new Date() } });
      this.events.emit("activity.updated", { userId });
      this.logger.info("health_import_succeeded", { jobId, userId, provider: providerType, recordsImported: imported, durationMs: Date.now() - started });
    } catch (error) {
      await this.prisma.syncJob.update({ where: { id: jobId }, data: { status: "FAILED", errorCode: "HISTORICAL_IMPORT_FAILED", errorMessage: error instanceof Error ? error.message : "Unknown error" } });
      this.logger.error("health_import_failed", error, { jobId, userId, provider: providerType });
    }
  }
}
