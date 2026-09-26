import { Injectable } from "@nestjs/common";
import { calculateStats } from "@steppy/health-domain";
import { PrismaService } from "../common/prisma.service.js";
import { todayInTimezone } from "../common/date.js";

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}
  async today(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const localDate = todayInTimezone(user.timezone);
    return (await this.prisma.dailyActivity.findUnique({ where: { userId_localDate: { userId, localDate } } })) ?? { localDate, steps: 0, timezone: user.timezone };
  }
  history(userId: string, from?: string, to?: string) { const localDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }; return this.prisma.dailyActivity.findMany({ where: { userId, localDate }, orderBy: { localDate: "asc" } }); }
  async stats(userId: string) { const rows = await this.prisma.dailyActivity.findMany({ where: { userId }, orderBy: { localDate: "asc" }, select: { localDate: true, steps: true, distanceMeters: true } }); return calculateStats(rows); }
}
