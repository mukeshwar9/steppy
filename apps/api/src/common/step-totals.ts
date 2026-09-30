import type { PrismaClient } from "@prisma/client";

export type StepTotal = { steps: number; daysWithData: number };

/** Sums DailySteps per user over from..to (inclusive, plain string compare on YYYY-MM-DD). */
export async function sumSteps(
  prisma: PrismaClient,
  userIds: string[],
  from: string,
  to: string
): Promise<Map<string, StepTotal>> {
  const out = new Map<string, StepTotal>();
  if (userIds.length === 0 || from > to) return out;
  const rows = await prisma.dailySteps.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, date: { gte: from, lte: to } },
    _sum: { steps: true },
    _count: { _all: true }
  });
  for (const r of rows) out.set(r.userId, { steps: r._sum.steps ?? 0, daysWithData: r._count._all });
  return out;
}

/** Steps per user per date over from..to: Map<userId, Map<date, steps>>. */
export async function dailyRows(
  prisma: PrismaClient,
  userIds: string[],
  from: string,
  to: string
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (userIds.length === 0 || from > to) return out;
  const rows = await prisma.dailySteps.findMany({
    where: { userId: { in: userIds }, date: { gte: from, lte: to } },
    select: { userId: true, date: true, steps: true }
  });
  for (const r of rows) {
    let m = out.get(r.userId);
    if (!m) out.set(r.userId, (m = new Map()));
    m.set(r.date, r.steps);
  }
  return out;
}
