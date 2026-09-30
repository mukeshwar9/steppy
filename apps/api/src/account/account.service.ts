import { Injectable, NotFoundException } from "@nestjs/common";
import { ChallengesService } from "../challenges/challenges.service.js";
import { PrismaService } from "../common/prisma.service.js";
import { SYNTHETIC_USERS } from "../demo/profiles.js";
import { GroupsService } from "../groups/groups.service.js";
import { RealtimeService } from "../realtime/realtime.service.js";

const SYNTHETIC_EMAILS = new Set(SYNTHETIC_USERS.map((u) => u.email));

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly challenges: ChallengesService,
    private readonly realtime: RealtimeService
  ) {}

  /**
   * Deletes the account and all its data. The user first leaves every group with the rules of
   * POST /groups/:id/leave (owner transfer, empty groups deleted, removed from open challenges).
   * Friendships, steps, refresh tokens and finished-challenge participations cascade; finished
   * challenge snapshots keep the display name in their JSON.
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    // Challenges that have ended but are not yet finalized would otherwise lose this user's result.
    await this.challenges.finalizeDue();

    // A demo guest's private group holds only the guest and synthetic friends: delete it as a whole.
    if (user.isDemo) await this.deletePrivateDemoGroups(userId);

    // Leave every group (the lock in leave() serializes against concurrent leaves). Loop in case the
    // user joined another group meanwhile with a still-valid token.
    for (let round = 0; round < 5; round++) {
      const memberships = await this.prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
      if (memberships.length === 0) break;
      for (const { groupId } of memberships) {
        try {
          await this.groups.leave(groupId, userId);
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error; // already left or group deleted meanwhile
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Challenges created by this user live on in their groups; hand them to the group owner
      // (the user's deletion would cascade-delete them otherwise).
      const created = await tx.challenge.findMany({ where: { createdById: userId }, select: { groupId: true } });
      for (const groupId of new Set(created.map((c) => c.groupId))) {
        const group = await tx.group.findUnique({ where: { id: groupId }, select: { ownerId: true } });
        if (group && group.ownerId !== userId) {
          await tx.challenge.updateMany({ where: { groupId, createdById: userId }, data: { createdById: group.ownerId } });
        }
      }
      await tx.user.delete({ where: { id: userId } });
    });
    await this.realtime.disconnectUser(userId);
  }

  private async deletePrivateDemoGroups(userId: string): Promise<void> {
    const owned = await this.prisma.group.findMany({
      where: { ownerId: userId },
      include: { members: { include: { user: { select: { id: true, email: true } } } } }
    });
    for (const group of owned) {
      const others = group.members.filter((m) => m.userId !== userId);
      if (others.length > 0 && others.every((m) => SYNTHETIC_EMAILS.has(m.user.email))) {
        await this.prisma.group.deleteMany({ where: { id: group.id } });
        await this.realtime.resubscribeUser(userId);
      }
    }
  }
}
