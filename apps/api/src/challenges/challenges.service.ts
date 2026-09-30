import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Inject } from "@nestjs/common";
import { Prisma, type Challenge, type ChallengeParticipant, type User } from "@prisma/client";
import {
  addDays,
  challengeStatus,
  challengeWindow,
  leadersOf,
  localDateInZone,
  type ChallengeDetail,
  type ChallengeStatus,
  type ChallengeSummary,
  type CreateChallengeRequest
} from "@steppy/core";
import { computeChallengeResult, type ChallengeResult } from "../common/challenge-result.js";
import { Clock } from "../common/clock.js";
import { APP_CONFIG, type AppConfig } from "../common/config.js";
import { MEMBER_SELECT } from "../common/mappers.js";
import { PrismaService } from "../common/prisma.service.js";
import { dailyRows } from "../common/step-totals.js";
import { isValidLocalDate } from "../common/timezone.js";
import { GroupsService } from "../groups/groups.service.js";
import { RealtimeService } from "../realtime/realtime.service.js";

type MemberUser = Pick<User, "id" | "displayName" | "stepSource" | "lastSyncedAt">;
type ChallengeFull = Challenge & { participants: Array<ChallengeParticipant & { user: MemberUser }> };

/** Challenges may be scheduled at most this many days ahead. */
const MAX_START_DAYS_AHEAD = 365;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function defaultChallengeName(kind: "WEEKLY" | "MONTHLY", startDate: string): string {
  const month = MONTHS[Number(startDate.slice(5, 7)) - 1] ?? "";
  return `${kind === "WEEKLY" ? "Weekly" : "Monthly"} challenge · ${month} ${Number(startDate.slice(8, 10))}`;
}

@Injectable()
export class ChallengesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChallengesService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly groups: GroupsService,
    private readonly realtime: RealtimeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  onModuleInit(): void {
    if (this.config.finalizerIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.finalizeDue().catch((error) => this.logger.error(`finalizer failed: ${String(error)}`));
      }, this.config.finalizerIntervalMs);
      this.timer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Finalizes every challenge that has settled and has no winners stored yet. Returns the count. */
  async finalizeDue(): Promise<number> {
    const pending = await this.prisma.challenge.findMany({ where: { finalizedAt: null } });
    const now = this.clock.now();
    let count = 0;
    for (const c of pending) {
      if (challengeStatus(c, now) !== "FINISHED") continue;
      try {
        if (await this.finalize(c)) count++;
      } catch (error) {
        this.logger.error(`failed to finalize challenge ${c.id}: ${String(error)}`);
      }
    }
    return count;
  }

  /** Stores winners and a snapshot of the final standings; only one concurrent caller wins the claim. */
  private async finalize(challenge: Challenge): Promise<boolean> {
    const participants = await this.prisma.challengeParticipant.findMany({
      where: { challengeId: challenge.id },
      include: { user: { select: MEMBER_SELECT } }
    });
    const result = await computeChallengeResult(this.prisma, participants, challenge.startDate, challenge.endDate);
    const claimed = await this.prisma.challenge.updateMany({
      where: { id: challenge.id, finalizedAt: null },
      data: {
        winnerIds: leadersOf(result.standings),
        finalStandings: result as unknown as Prisma.InputJsonValue,
        finalizedAt: this.clock.now()
      }
    });
    if (claimed.count !== 1) return false;
    this.realtime.emitToGroup(challenge.groupId, "group.updated", { groupId: challenge.groupId, reason: "settled" });
    return true;
  }

  async listForGroup(groupId: string, userId: string): Promise<ChallengeSummary[]> {
    await this.groups.requireMember(groupId, userId);
    await this.finalizeGroup(groupId);
    const challenges = await this.prisma.challenge.findMany({
      where: { groupId },
      orderBy: [{ createdAt: "desc" }, { startDate: "desc" }],
      include: { participants: { include: { user: { select: MEMBER_SELECT } } } }
    });
    return this.summaries(challenges);
  }

  async create(groupId: string, userId: string, input: CreateChallengeRequest): Promise<ChallengeDetail> {
    const group = await this.groups.requireMember(groupId, userId);
    const now = this.clock.now();
    const today = localDateInZone(now, group.timezone);
    const startDate = input.startDate ?? today;
    if (!isValidLocalDate(startDate)) throw new BadRequestException(`Invalid startDate: ${startDate}`);
    if (startDate < today) throw new BadRequestException("startDate may not be in the past");
    if (startDate > addDays(today, MAX_START_DAYS_AHEAD)) {
      throw new BadRequestException(`startDate may be at most ${MAX_START_DAYS_AHEAD} days ahead`);
    }
    const { endDate } = challengeWindow(input.kind, startDate);

    const members = await this.prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
    const memberIds = new Set(members.map((m) => m.userId));
    const requested = input.participantIds ?? [...memberIds];
    if (requested.some((id) => !memberIds.has(id))) throw new BadRequestException("Participants must be group members");
    const participantIds = [...new Set([userId, ...requested])];

    const challenge = await this.prisma.challenge.create({
      data: {
        groupId,
        name: input.name ?? defaultChallengeName(input.kind, startDate),
        kind: input.kind,
        startDate,
        endDate,
        timezone: group.timezone,
        createdById: userId,
        participants: { create: participantIds.map((id) => ({ userId: id })) }
      }
    });
    this.realtime.emitToGroup(groupId, "group.updated", { groupId, reason: "challenge" });
    return this.detail(challenge.id);
  }

  /** Loads the challenge for a group member (404 otherwise) and finalizes it if due. */
  async get(challengeId: string, userId: string): Promise<ChallengeDetail> {
    await this.requireAccess(challengeId, userId);
    return this.detail(challengeId);
  }

  async join(challengeId: string, userId: string): Promise<ChallengeDetail> {
    const challenge = await this.requireAccess(challengeId, userId);
    this.assertOpen(challenge);
    try {
      await this.prisma.challengeParticipant.create({ data: { challengeId, userId } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      return this.detail(challengeId); // already a participant (idempotent)
    }
    this.realtime.emitToGroup(challenge.groupId, "group.updated", { groupId: challenge.groupId, reason: "challenge" });
    return this.detail(challengeId);
  }

  async leave(challengeId: string, userId: string): Promise<ChallengeDetail> {
    const challenge = await this.requireAccess(challengeId, userId);
    this.assertOpen(challenge);
    const { count } = await this.prisma.challengeParticipant.deleteMany({ where: { challengeId, userId } });
    if (count > 0) {
      this.realtime.emitToGroup(challenge.groupId, "group.updated", { groupId: challenge.groupId, reason: "challenge" });
    }
    return this.detail(challengeId);
  }

  private assertOpen(challenge: Challenge): void {
    const status = challengeStatus(challenge, this.clock.now());
    if (status !== "UPCOMING" && status !== "ACTIVE") throw new BadRequestException("Challenge is no longer open");
  }

  private async requireAccess(challengeId: string, userId: string): Promise<Challenge> {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException("Challenge not found");
    await this.groups.requireMember(challenge.groupId, userId); // 404 for non-members
    return challenge;
  }

  private async finalizeGroup(groupId: string): Promise<void> {
    const now = this.clock.now();
    const pending = await this.prisma.challenge.findMany({ where: { groupId, finalizedAt: null } });
    for (const c of pending) if (challengeStatus(c, now) === "FINISHED") await this.finalize(c);
  }

  private async load(challengeId: string): Promise<ChallengeFull> {
    return this.prisma.challenge.findUniqueOrThrow({
      where: { id: challengeId },
      include: { participants: { include: { user: { select: MEMBER_SELECT } } } }
    });
  }

  private toSummary(c: ChallengeFull, status: ChallengeStatus, leaderIds: string[]): ChallengeSummary {
    return {
      id: c.id,
      groupId: c.groupId,
      name: c.name,
      kind: c.kind,
      startDate: c.startDate,
      endDate: c.endDate,
      timezone: c.timezone,
      status,
      participantCount: c.participants.length,
      leaderIds,
      createdById: c.createdById,
      createdAt: c.createdAt.toISOString()
    };
  }

  /** Summaries for many challenges with a single step query (no per-challenge round trips). */
  private async summaries(challenges: ChallengeFull[]): Promise<ChallengeSummary[]> {
    const now = this.clock.now();
    const live = challenges.filter((c) => !c.finalizedAt);
    const userIds = [...new Set(live.flatMap((c) => c.participants.map((p) => p.userId)))];
    const ranges = live.map((c) => ({ c, to: this.liveEnd(c, now) })).filter((r) => r.to >= r.c.startDate);
    const rows =
      ranges.length > 0
        ? await dailyRows(
            this.prisma,
            userIds,
            ranges.reduce((min, r) => (r.c.startDate < min ? r.c.startDate : min), ranges[0]!.c.startDate),
            ranges.reduce((max, r) => (r.to > max ? r.to : max), ranges[0]!.to)
          )
        : new Map<string, Map<string, number>>();
    return challenges.map((c) => {
      const status = challengeStatus(c, now);
      if (c.finalizedAt) return this.toSummary(c, status, c.winnerIds);
      const to = this.liveEnd(c, now);
      const totals = c.participants.map((p) => {
        let steps = 0;
        const perDay = rows.get(p.userId);
        if (perDay) for (const d of perDay.keys()) if (d >= c.startDate && d <= to) steps += perDay.get(d) ?? 0;
        return { userId: p.userId, steps };
      });
      return this.toSummary(c, status, leadersOf(totals));
    });
  }

  private liveEnd(c: Challenge, now: Date): string {
    const today = localDateInZone(now, c.timezone);
    return c.endDate < today ? c.endDate : today;
  }

  private async detail(challengeId: string): Promise<ChallengeDetail> {
    let c = await this.load(challengeId);
    const now = this.clock.now();
    if (!c.finalizedAt && challengeStatus(c, now) === "FINISHED") {
      await this.finalize(c);
      c = await this.load(challengeId);
    }
    const status = challengeStatus(c, now);
    // Finalized challenges are served from the snapshot so standings always agree with winnerIds.
    const snapshot = c.finalizedAt ? (c.finalStandings as ChallengeResult | null) : null;
    const result = snapshot ?? (await computeChallengeResult(this.prisma, c.participants, c.startDate, this.liveEnd(c, now)));
    const leaderIds = c.finalizedAt ? c.winnerIds : leadersOf(result.standings);
    return {
      ...this.toSummary(c, status, leaderIds),
      ...result,
      winnerIds: status === "FINISHED" ? c.winnerIds : []
    };
  }
}
