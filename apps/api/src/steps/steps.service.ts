import { BadRequestException, Injectable } from "@nestjs/common";
import {
  MAX_UPLOAD_DAYS,
  addDays,
  isDaySettled,
  localDateInZone,
  type DailySteps,
  type StepSource,
  type UploadStepsRequest,
  type UploadStepsResponse
} from "@steppy/core";
import { Clock } from "../common/clock.js";
import { PrismaService } from "../common/prisma.service.js";
import { assertTimezone, daySpan, isValidLocalDate } from "../common/timezone.js";
import { RealtimeService } from "../realtime/realtime.service.js";

@Injectable()
export class StepsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly realtime: RealtimeService
  ) {}

  async upload(userId: string, input: UploadStepsRequest): Promise<UploadStepsResponse> {
    assertTimezone(input.timezone);
    const now = this.clock.now();
    const today = localDateInZone(now, input.timezone);

    // Last value wins for duplicated dates within one request.
    const oldest = addDays(today, -(MAX_UPLOAD_DAYS - 1));
    const byDate = new Map<string, number>();
    for (const day of input.days) {
      if (!isValidLocalDate(day.date)) throw new BadRequestException(`Invalid date: ${day.date}`);
      // One day of slack for clock skew between phone and server.
      if (day.date > addDays(today, 1)) throw new BadRequestException(`Date is in the future: ${day.date}`);
      if (day.date < oldest) throw new BadRequestException(`Date is older than ${MAX_UPLOAD_DAYS} days: ${day.date}`);
      byDate.set(day.date, day.steps);
    }
    const dates = [...byDate.keys()].sort();

    const accepted: string[] = [];
    const frozen: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.dailySteps.findMany({
        where: { userId, date: { in: dates } },
        select: { date: true }
      });
      const hasRow = new Set(existing.map((r) => r.date));
      for (const date of dates) {
        if (hasRow.has(date) && isDaySettled(date, input.timezone, now)) {
          frozen.push(date);
          continue;
        }
        const steps = byDate.get(date) as number;
        await tx.dailySteps.upsert({
          where: { userId_date: { userId, date } },
          create: { userId, date, steps, source: input.source, timezone: input.timezone },
          update: { steps, source: input.source, timezone: input.timezone }
        });
        accepted.push(date);
      }
      await tx.user.update({
        where: { id: userId },
        data: { stepSource: input.source, lastSyncedAt: now, timezone: input.timezone }
      });
    });

    if (accepted.length > 0) await this.emitUpdated(userId, accepted, now);
    return { accepted, frozen, lastSyncedAt: now.toISOString() };
  }

  async emitUpdated(userId: string, dates: string[], at: Date): Promise<void> {
    const memberships = await this.prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
    for (const { groupId } of memberships) {
      this.realtime.emitToGroup(groupId, "steps.updated", { groupId, userId, dates, lastSyncedAt: at.toISOString() });
    }
  }

  async list(userId: string, from?: string, to?: string): Promise<DailySteps[]> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const end = to ?? localDateInZone(now, user.timezone);
    const start = from ?? addDays(end, -29);
    if (!isValidLocalDate(start) || !isValidLocalDate(end)) throw new BadRequestException("Invalid date");
    if (start > end) throw new BadRequestException("from must not be after to");
    if (daySpan(start, end) > MAX_UPLOAD_DAYS) {
      throw new BadRequestException(`Range is limited to ${MAX_UPLOAD_DAYS} days`);
    }
    const rows = await this.prisma.dailySteps.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: "asc" }
    });
    return rows.map((r) => ({
      date: r.date,
      steps: r.steps,
      source: r.source as StepSource,
      settled: isDaySettled(r.date, r.timezone, now),
      updatedAt: r.updatedAt.toISOString()
    }));
  }
}
