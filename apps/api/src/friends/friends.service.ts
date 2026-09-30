import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { localDateInZone, type Friend, type StepSource } from "@steppy/core";
import { Clock } from "../common/clock.js";
import { MEMBER_SELECT, toMember } from "../common/mappers.js";
import { PrismaService } from "../common/prisma.service.js";

export const pairOf = (a: string, b: string): { userAId: string; userBId: string } =>
  a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  async areFriends(a: string, b: string): Promise<boolean> {
    const count = await this.prisma.friendship.count({ where: pairOf(a, b) });
    return count > 0;
  }

  async list(userId: string): Promise<Friend[]> {
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const today = localDateInZone(this.clock.now(), me.timezone);
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: {
        userA: { select: { ...MEMBER_SELECT, friendCode: true } },
        userB: { select: { ...MEMBER_SELECT, friendCode: true } }
      }
    });
    const friends = rows.map((r) => ({ friend: r.userAId === userId ? r.userB : r.userA, since: r.createdAt }));
    const todayRows = await this.prisma.dailySteps.findMany({
      where: { userId: { in: friends.map((f) => f.friend.id) }, date: today },
      select: { userId: true, steps: true }
    });
    const todayByUser = new Map(todayRows.map((r) => [r.userId, r.steps]));
    return friends
      .map(({ friend, since }) => this.toFriend(friend, since, todayByUser.get(friend.id) ?? 0))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async addByCode(userId: string, friendCode: string): Promise<Friend> {
    const target = await this.prisma.user.findUnique({ where: { friendCode } });
    if (!target) throw new NotFoundException("Unknown friend code");
    if (target.id === userId) throw new BadRequestException("That is your own friend code");
    const pair = pairOf(userId, target.id);
    const friendship = await this.prisma.friendship.upsert({ where: { userAId_userBId: pair }, create: pair, update: {} });
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const today = localDateInZone(this.clock.now(), me.timezone);
    const row = await this.prisma.dailySteps.findUnique({ where: { userId_date: { userId: target.id, date: today } } });
    return this.toFriend(target, friendship.createdAt, row?.steps ?? 0);
  }

  async remove(userId: string, friendId: string): Promise<void> {
    await this.prisma.friendship.deleteMany({ where: pairOf(userId, friendId) });
  }

  private toFriend(
    u: { id: string; displayName: string; stepSource: StepSource | null; lastSyncedAt: Date | null; friendCode: string },
    since: Date,
    todaySteps: number
  ): Friend {
    return { ...toMember(u), friendCode: u.friendCode, todaySteps, since: since.toISOString() };
  }
}
