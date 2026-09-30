import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Group, GroupMember, User } from "@prisma/client";
import {
  challengeStatus,
  dateRange,
  addDays,
  isDaySettled,
  localDateInZone,
  periodRange,
  rankBySteps,
  type CreateGroupRequest,
  type GroupDetail,
  type GroupHistory,
  type GroupSummary,
  type Leaderboard,
  type LeaderboardPeriod
} from "@steppy/core";
import { Clock } from "../common/clock.js";
import { uniqueCode } from "../common/codes.js";
import { MEMBER_SELECT, toMember } from "../common/mappers.js";
import { PrismaService } from "../common/prisma.service.js";
import { dailyRows, sumSteps } from "../common/step-totals.js";
import { assertTimezone } from "../common/timezone.js";
import { FriendsService } from "../friends/friends.service.js";
import { RealtimeService } from "../realtime/realtime.service.js";

type GroupWithMembers = Group & {
  members: Array<GroupMember & { user: Pick<User, "id" | "displayName" | "stepSource" | "lastSyncedAt"> }>;
};

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly friends: FriendsService,
    private readonly realtime: RealtimeService
  ) {}

  /** Loads a group the user belongs to; 404 for unknown groups and non-members alike. */
  async requireMember(groupId: string, userId: string): Promise<Group> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { group: true }
    });
    if (!membership) throw new NotFoundException("Group not found");
    return membership.group;
  }

  async list(userId: string): Promise<GroupSummary[]> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      orderBy: { joinedAt: "desc" },
      select: { groupId: true }
    });
    const groups = await this.prisma.group.findMany({
      where: { id: { in: memberships.map((m) => m.groupId) } },
      include: { _count: { select: { members: true } }, challenges: true }
    });
    const order = new Map(memberships.map((m, i) => [m.groupId, i]));
    groups.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const now = this.clock.now();
    return groups.map((g) =>
      this.toSummary(g, g._count.members, g.challenges.filter((c) => challengeStatus(c, now) === "ACTIVE").length)
    );
  }

  async create(userId: string, input: CreateGroupRequest): Promise<GroupDetail> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const timezone = assertTimezone(input.timezone ?? user.timezone);
    const inviteCode = await uniqueCode(async (code) => (await this.prisma.group.count({ where: { inviteCode: code } })) > 0);
    const group = await this.prisma.group.create({
      data: {
        name: input.name,
        timezone,
        inviteCode,
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } }
      }
    });
    await this.realtime.resubscribeUser(userId);
    return this.detail(group.id);
  }

  async get(groupId: string, userId: string): Promise<GroupDetail> {
    await this.requireMember(groupId, userId);
    return this.detail(groupId);
  }

  async join(userId: string, inviteCode: string): Promise<GroupDetail> {
    const group = await this.prisma.group.findUnique({ where: { inviteCode } });
    if (!group) throw new NotFoundException("Unknown invite code");
    await this.addMember(group.id, userId);
    return this.detail(group.id);
  }

  async addFriend(groupId: string, actorId: string, targetId: string): Promise<GroupDetail> {
    await this.requireMember(groupId, actorId);
    if (targetId !== actorId && !(await this.friends.areFriends(actorId, targetId))) {
      throw new ForbiddenException("You can only add your friends to a group");
    }
    await this.addMember(groupId, targetId);
    return this.detail(groupId);
  }

  private async addMember(groupId: string, userId: string): Promise<void> {
    const existing = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (existing) return;
    try {
      await this.prisma.groupMember.create({ data: { groupId, userId, role: "MEMBER" } });
    } catch {
      return; // concurrent join: already a member
    }
    await this.realtime.resubscribeUser(userId);
    this.realtime.emitToGroup(groupId, "group.updated", { groupId, reason: "member" });
  }

  async leave(groupId: string, userId: string): Promise<void> {
    await this.requireMember(groupId, userId);
    const now = this.clock.now();
    const remaining = await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({ where: { groupId_userId: { groupId, userId } } });
      const challenges = await tx.challenge.findMany({ where: { groupId } });
      const open = challenges.filter((c) => challengeStatus(c, now) !== "FINISHED").map((c) => c.id);
      if (open.length > 0) await tx.challengeParticipant.deleteMany({ where: { userId, challengeId: { in: open } } });
      const members = await tx.groupMember.findMany({ where: { groupId }, orderBy: { joinedAt: "asc" } });
      if (members.length === 0) {
        await tx.group.delete({ where: { id: groupId } });
        return 0;
      }
      const group = await tx.group.findUniqueOrThrow({ where: { id: groupId } });
      if (group.ownerId === userId) {
        const next = members[0] as GroupMember;
        await tx.group.update({ where: { id: groupId }, data: { ownerId: next.userId } });
        await tx.groupMember.update({ where: { id: next.id }, data: { role: "OWNER" } });
      }
      return members.length;
    });
    await this.realtime.resubscribeUser(userId);
    if (remaining > 0) this.realtime.emitToGroup(groupId, "group.updated", { groupId, reason: "member" });
  }

  async rotateInviteCode(groupId: string, userId: string): Promise<GroupSummary> {
    const group = await this.requireMember(groupId, userId);
    if (group.ownerId !== userId) throw new ForbiddenException("Only the owner can rotate the invite code");
    const inviteCode = await uniqueCode(async (code) => (await this.prisma.group.count({ where: { inviteCode: code } })) > 0);
    await this.prisma.group.update({ where: { id: groupId }, data: { inviteCode } });
    return (await this.detail(groupId)) as GroupSummary;
  }

  async leaderboard(groupId: string, userId: string, period: LeaderboardPeriod): Promise<Leaderboard> {
    const group = await this.requireMember(groupId, userId);
    const now = this.clock.now();
    const today = localDateInZone(now, group.timezone);
    const { from, to } = periodRange(period, today);
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: MEMBER_SELECT } }
    });
    const totals = await sumSteps(this.prisma, members.map((m) => m.userId), from, to);
    const days = dateRange(from, to).length;
    const entries = rankBySteps(
      members.map((m) => {
        const t = totals.get(m.userId);
        const steps = t?.steps ?? 0;
        return {
          ...toMember(m.user),
          steps,
          dailyAverage: Math.round(steps / days),
          daysWithData: t?.daysWithData ?? 0,
          tieBreak: m.user.displayName
        };
      })
    ).map(({ tieBreak: _tieBreak, ...entry }) => entry);
    return { groupId, period, from, to, timezone: group.timezone, entries, generatedAt: now.toISOString() };
  }

  async history(groupId: string, userId: string, days: number): Promise<GroupHistory> {
    const group = await this.requireMember(groupId, userId);
    const now = this.clock.now();
    const today = localDateInZone(now, group.timezone);
    const dates = dateRange(addDays(today, -(days - 1)), today);
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: MEMBER_SELECT } }
    });
    const rows = await dailyRows(this.prisma, members.map((m) => m.userId), dates[0] as string, today);
    const settled = dates.map((d) => isDaySettled(d, group.timezone, now));
    return {
      groupId,
      dates,
      members: members.map((m) => ({
        ...toMember(m.user),
        steps: dates.map((d) => rows.get(m.userId)?.get(d) ?? null),
        settled
      }))
    };
  }

  private async detail(groupId: string): Promise<GroupDetail> {
    const group = (await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      include: { members: { orderBy: { joinedAt: "asc" }, include: { user: { select: MEMBER_SELECT } } } }
    })) as GroupWithMembers;
    const now = this.clock.now();
    const today = localDateInZone(now, group.timezone);
    const todayRows = await dailyRows(this.prisma, group.members.map((m) => m.userId), today, today);
    const challenges = await this.prisma.challenge.findMany({ where: { groupId } });
    const active = challenges.filter((c) => challengeStatus(c, now) === "ACTIVE").length;
    return {
      ...this.toSummary(group, group.members.length, active),
      members: group.members.map((m) => ({
        ...toMember(m.user),
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        todaySteps: todayRows.get(m.userId)?.get(today) ?? 0
      }))
    };
  }

  private toSummary(g: Group, memberCount: number, activeChallengeCount: number): GroupSummary {
    return {
      id: g.id,
      name: g.name,
      timezone: g.timezone,
      memberCount,
      inviteCode: g.inviteCode,
      ownerId: g.ownerId,
      activeChallengeCount,
      createdAt: g.createdAt.toISOString()
    };
  }
}
