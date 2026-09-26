import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { rankChallengeRows } from "@steppy/health-domain";
import { PrismaService } from "../common/prisma.service.js";
import { addDays } from "../common/date.js";
import type { CreateChallengeDto, InviteChallengeDto } from "./challenges.dto.js";

function localDateAt(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventEmitter2) {}
  async create(userId: string, dto: CreateChallengeDto) {
    const challenge = await this.prisma.challenge.create({ data: { creatorId: userId, name: dto.name, description: dto.description, startAt: new Date(dto.startAt), endAt: new Date(dto.endAt), timezone: dto.timezone, participants: { create: { userId } } } });
    await this.refresh(challenge.id); return challenge;
  }
  list(userId: string) { return this.prisma.challenge.findMany({ where: { participants: { some: { userId } } }, orderBy: { startAt: "desc" }, select: { id: true, name: true, description: true, startAt: true, endAt: true, timezone: true, status: true, participants: { select: { userId: true } } } }); }
  async get(userId: string, challengeId: string) { await this.assertParticipant(userId, challengeId); const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } }); if (!challenge) throw new NotFoundException("Challenge not found"); return { ...challenge, leaderboard: await this.leaderboard(challengeId) }; }
  async join(userId: string, challengeId: string) { const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } }); if (!challenge) throw new NotFoundException("Challenge not found"); if (challenge.endAt < new Date()) throw new BadRequestException("Challenge has ended"); await this.prisma.challengeParticipant.upsert({ where: { challengeId_userId: { challengeId, userId } }, create: { challengeId, userId }, update: {} }); await this.refresh(challengeId); return this.leaderboard(challengeId); }
  async invite(userId: string, challengeId: string, dto: InviteChallengeDto) { await this.assertParticipant(userId, challengeId); const invitee = await this.prisma.user.findUnique({ where: { username: dto.username }, select: { id: true } }); if (!invitee) throw new NotFoundException("User not found"); await this.prisma.challengeParticipant.upsert({ where: { challengeId_userId: { challengeId, userId: invitee.id } }, create: { challengeId, userId: invitee.id }, update: {} }); await this.refresh(challengeId); return { invited: true }; }
  async leave(userId: string, challengeId: string) { await this.assertParticipant(userId, challengeId); await this.prisma.challengeParticipant.delete({ where: { challengeId_userId: { challengeId, userId } } }); return { left: true }; }
  async leaderboard(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId }, include: { participants: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } } } });
    if (!challenge) throw new NotFoundException("Challenge not found");
    const totals = await this.prisma.challengeDailyTotal.groupBy({ by: ["userId"], where: { challengeId }, _sum: { steps: true } });
    const rows = challenge.participants.map(participant => ({ userId: participant.userId, displayName: participant.user.displayName, username: participant.user.username, avatarUrl: participant.user.avatarUrl, steps: totals.find(total => total.userId === participant.userId)?._sum.steps ?? 0 }));
    const ranked = rankChallengeRows(rows);
    return ranked.map((row, index) => ({ ...row, differenceAbove: index > 0 ? row.steps - ranked[index - 1]!.steps : null, differenceBelow: index < ranked.length - 1 ? row.steps - ranked[index + 1]!.steps : null }));
  }
  @OnEvent("activity.updated")
  async refreshForUser(event: { userId: string }) { const challenges = await this.prisma.challenge.findMany({ where: { participants: { some: { userId: event.userId } }, endAt: { gte: new Date() } }, select: { id: true } }); for (const challenge of challenges) await this.refresh(challenge.id); }
  async refresh(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId }, include: { participants: true } }); if (!challenge) return;
    const start = localDateAt(challenge.startAt, challenge.timezone), end = localDateAt(challenge.endAt, challenge.timezone);
    await this.prisma.challenge.update({ where: { id: challengeId }, data: { status: challenge.endAt < new Date() ? "COMPLETED" : challenge.startAt > new Date() ? "UPCOMING" : "ACTIVE" } });
    for (const participant of challenge.participants) {
      const activities = await this.prisma.dailyActivity.findMany({ where: { userId: participant.userId, localDate: { gte: start, lte: end } }, select: { id: true, localDate: true, steps: true } });
      await this.prisma.challengeDailyTotal.deleteMany({ where: { challengeId, userId: participant.userId } });
      if (activities.length) await this.prisma.challengeDailyTotal.createMany({ data: activities.map(activity => ({ challengeId, userId: participant.userId, activityId: activity.id, localDate: activity.localDate, steps: activity.steps })) });
    }
    this.events.emit("challenge.leaderboard.updated", { challengeId, updatedAt: new Date().toISOString(), participants: await this.leaderboard(challengeId) });
  }
  private async assertParticipant(userId: string, challengeId: string) { const participant = await this.prisma.challengeParticipant.findUnique({ where: { challengeId_userId: { challengeId, userId } } }); if (!participant) throw new ForbiddenException("Challenge access denied"); }
}
