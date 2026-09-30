import type { ChallengeStanding } from "@steppy/core";
import { dateRange, rankBySteps } from "@steppy/core";
import type { PrismaClient, User } from "@prisma/client";
import { toMember } from "./mappers.js";
import { dailyRows } from "./step-totals.js";

export type ChallengeResult = {
  standings: ChallengeStanding[];
  days: string[];
  daily: Array<{ userId: string; steps: Array<number | null> }>;
};

type ParticipantUser = Pick<User, "id" | "displayName" | "stepSource" | "lastSyncedAt">;

/** Standings and day-by-day grid of the participants over startDate..to (empty grid when to < startDate). */
export async function computeChallengeResult(
  prisma: PrismaClient,
  participants: Array<{ userId: string; user: ParticipantUser }>,
  startDate: string,
  to: string
): Promise<ChallengeResult> {
  const days = to < startDate ? [] : dateRange(startDate, to);
  const rows = await dailyRows(prisma, participants.map((p) => p.userId), startDate, to);
  const ranked = rankBySteps(
    participants.map((p) => {
      const perDay = rows.get(p.userId);
      let steps = 0;
      if (perDay) for (const d of days) steps += perDay.get(d) ?? 0;
      return { ...toMember(p.user), steps, tieBreak: p.user.displayName };
    })
  );
  const standings: ChallengeStanding[] = ranked.map(({ tieBreak: _t, ...s }) => s);
  return {
    standings,
    days,
    daily: standings.map((s) => ({ userId: s.userId, steps: days.map((d) => rows.get(s.userId)?.get(d) ?? null) }))
  };
}
