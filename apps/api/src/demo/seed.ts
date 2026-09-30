import type { Group, Prisma, PrismaClient, User } from "@prisma/client";
import { BACKFILL_DAYS, addDays, challengeWindow, dateRange, leadersOf, localDateInZone, periodRange } from "@steppy/core";
import bcrypt from "bcryptjs";
import { computeChallengeResult } from "../common/challenge-result.js";
import { uniqueCode } from "../common/codes.js";
import { MEMBER_SELECT } from "../common/mappers.js";
import { DEMO_CAPTAIN, DEMO_GROUP_NAME, DEMO_PASSWORD, SYNTHETIC_USERS, cumulativeFraction, dayTotal, localMinuteOfDay, profileFor } from "./profiles.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const challengeName = (kind: "WEEKLY" | "MONTHLY", start: string): string =>
  `${kind === "WEEKLY" ? "Weekly" : "Monthly"} challenge · ${MONTHS[Number(start.slice(5, 7)) - 1]} ${Number(start.slice(8, 10))}`;

export async function uniqueFriendCode(prisma: PrismaClient): Promise<string> {
  return uniqueCode(async (code) => (await prisma.user.count({ where: { friendCode: code } })) > 0);
}

/** Writes 90 days of history (through yesterday) plus a partial today for one demo user, keeping existing rows. */
export async function writeDemoSteps(prisma: PrismaClient, user: Pick<User, "id" | "email" | "timezone">, now: Date): Promise<void> {
  const profile = profileFor(user);
  const today = localDateInZone(now, user.timezone);
  const rows = dateRange(addDays(today, -BACKFILL_DAYS), addDays(today, -1)).map((date) => ({
    userId: user.id,
    date,
    steps: dayTotal(profile, user.id, date),
    source: "DEMO" as const,
    timezone: user.timezone
  }));
  const fraction = cumulativeFraction(localMinuteOfDay(now, user.timezone));
  rows.push({
    userId: user.id,
    date: today,
    steps: Math.round(dayTotal(profile, user.id, today) * fraction),
    source: "DEMO",
    timezone: user.timezone
  });
  await prisma.dailySteps.createMany({ data: rows, skipDuplicates: true });
  await prisma.user.update({ where: { id: user.id }, data: { stepSource: "DEMO", lastSyncedAt: now } });
}

/** Idempotent: creates the demo accounts, group, 90 days of steps and the three demo challenges. */
export async function seedDemo(prisma: PrismaClient, opts: { now: Date; timezone: string }): Promise<{ groupId: string }> {
  const { now, timezone } = opts;
  const accounts = [DEMO_CAPTAIN, ...SYNTHETIC_USERS];
  let passwordHash: string | null = null;

  const users: User[] = [];
  for (const account of accounts) {
    let user = await prisma.user.findFirst({ where: { email: account.email, isDemo: true } });
    if (!user) {
      if (await prisma.user.count({ where: { email: account.email } })) {
        throw new Error(`${account.email} is taken by a non-demo account; remove it before seeding`);
      }
      passwordHash ??= await bcrypt.hash(DEMO_PASSWORD, 8);
      user = await prisma.user.create({
        data: {
          email: account.email,
          passwordHash,
          displayName: account.displayName,
          friendCode: await uniqueFriendCode(prisma),
          timezone,
          stepSource: "DEMO",
          isDemo: true
        }
      });
    }
    users.push(user);
  }
  const captain = users[0] as User;

  // Everyone is friends with everyone.
  const pairs: Array<{ userAId: string; userBId: string }> = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const a = (users[i] as User).id;
      const b = (users[j] as User).id;
      pairs.push(a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });
    }
  }
  await prisma.friendship.createMany({ data: pairs, skipDuplicates: true });

  let group = await prisma.group.findFirst({ where: { name: DEMO_GROUP_NAME, ownerId: captain.id } });
  if (!group) {
    group = await prisma.group.create({
      data: {
        name: DEMO_GROUP_NAME,
        timezone,
        ownerId: captain.id,
        inviteCode: await uniqueCode(async (code) => (await prisma.group.count({ where: { inviteCode: code } })) > 0)
      }
    });
  }
  await prisma.groupMember.createMany({
    data: users.map((u) => ({ groupId: group.id, userId: u.id, role: u.id === captain.id ? ("OWNER" as const) : ("MEMBER" as const) })),
    skipDuplicates: true
  });

  for (const user of users) await writeDemoSteps(prisma, user, now);

  await ensureDemoChallenges(prisma, group, users, captain.id, now);
  return { groupId: group.id };
}

/**
 * Idempotent: the three demo challenges of a group (a weekly one finished two weeks ago and finalized with a
 * snapshot, plus an active weekly and an active monthly), with all `users` participating.
 */
export async function ensureDemoChallenges(
  prisma: PrismaClient,
  group: Pick<Group, "id" | "timezone">,
  users: Array<Pick<User, "id">>,
  createdById: string,
  now: Date
): Promise<void> {
  const today = localDateInZone(now, group.timezone);
  const weekStart = periodRange("week", today).from;
  const specs: Array<{ kind: "WEEKLY" | "MONTHLY"; start: string }> = [
    { kind: "WEEKLY", start: addDays(weekStart, -14) },
    { kind: "WEEKLY", start: weekStart },
    { kind: "MONTHLY", start: `${today.slice(0, 7)}-01` }
  ];
  for (const spec of specs) {
    let challenge = await prisma.challenge.findFirst({ where: { groupId: group.id, kind: spec.kind, startDate: spec.start } });
    if (!challenge) {
      const { endDate } = challengeWindow(spec.kind, spec.start);
      challenge = await prisma.challenge.create({
        data: {
          groupId: group.id,
          name: challengeName(spec.kind, spec.start),
          kind: spec.kind,
          startDate: spec.start,
          endDate,
          timezone: group.timezone,
          createdById
        }
      });
    }
    await prisma.challengeParticipant.createMany({
      data: users.map((u) => ({ challengeId: challenge.id, userId: u.id })),
      skipDuplicates: true
    });
    if (!challenge.finalizedAt && challenge.endDate < addDays(today, -1)) {
      const participants = await prisma.challengeParticipant.findMany({
        where: { challengeId: challenge.id },
        include: { user: { select: MEMBER_SELECT } }
      });
      const result = await computeChallengeResult(prisma, participants, challenge.startDate, challenge.endDate);
      await prisma.challenge.updateMany({
        where: { id: challenge.id, finalizedAt: null },
        data: {
          winnerIds: leadersOf(result.standings),
          finalStandings: result as unknown as Prisma.InputJsonValue,
          finalizedAt: now
        }
      });
    }
  }
}
