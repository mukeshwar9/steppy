import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { User } from "@prisma/client";
import { localDateInZone } from "@steppy/core";
import { randomBytes, randomInt } from "node:crypto";
import { AccountService } from "../account/account.service.js";
import { uniqueCode } from "../common/codes.js";
import { Clock } from "../common/clock.js";
import { APP_CONFIG, type AppConfig } from "../common/config.js";
import { PrismaService } from "../common/prisma.service.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { DEMO_CAPTAIN, DEMO_GUEST_GROUP_NAME, DEMO_GROUP_NAME, SYNTHETIC_USERS, TOTAL_WEIGHT, dayTotal, localMinuteOfDay, minuteWeight, profileFor } from "./profiles.js";
import { ensureDemoChallenges, seedDemo, uniqueFriendCode } from "./seed.js";

const GUEST_MAX_AGE_DAYS = 7;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class DemoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemoService.name);
  private timer: NodeJS.Timeout | null = null;
  private seededOn: string | null = null;
  private seeding: Promise<string> | null = null;
  private lastCleanupAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly realtime: RealtimeService,
    private readonly account: AccountService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  onModuleInit(): void {
    if (this.config.demoMode && this.config.demoTickerIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.tick().catch((error) => this.logger.error(`demo ticker failed: ${String(error)}`));
        const now = this.clock.now();
        if (now.getTime() - this.lastCleanupAt >= CLEANUP_INTERVAL_MS) {
          this.lastCleanupAt = now.getTime();
          this.cleanupGuests(now).catch((error) => this.logger.error(`demo cleanup failed: ${String(error)}`));
        }
      }, this.config.demoTickerIntervalMs);
      this.timer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs the idempotent seed at most once per day (and concurrently only once). Returns the demo group id. */
  async ensureSeeded(): Promise<string> {
    const today = localDateInZone(this.clock.now(), this.config.demoTimezone);
    const existing = await this.prisma.group.findFirst({
      where: { name: DEMO_GROUP_NAME, owner: { email: DEMO_CAPTAIN.email, isDemo: true } }
    });
    if (existing && this.seededOn === today) return existing.id;
    this.seeding ??= seedDemo(this.prisma, { now: this.clock.now(), timezone: this.config.demoTimezone })
      .then(({ groupId }) => {
        this.seededOn = today;
        return groupId;
      })
      .finally(() => {
        this.seeding = null;
      });
    return this.seeding;
  }

  /**
   * Creates a fresh demo guest (no steps) who is friends with the five synthetic users and owns a private
   * "Demo group" with them: an active weekly and monthly challenge and a finished weekly one.
   */
  async createDemoUser(displayName: string | undefined, timezone: string): Promise<User> {
    await this.ensureSeeded();
    const now = this.clock.now();
    const user = await this.prisma.user.create({
      data: {
        email: `demo-${randomBytes(6).toString("hex")}@demo.steppy.app`,
        passwordHash: "!demo-account-has-no-password",
        displayName: displayName ?? `Guest ${randomInt(1000, 10000)}`,
        friendCode: await uniqueFriendCode(this.prisma),
        timezone,
        isDemo: true
      }
    });
    // Guests get no server-generated steps: theirs come from the phone (on-device demo generator or a health store).
    const synthetic = await this.prisma.user.findMany({
      where: { isDemo: true, email: { in: SYNTHETIC_USERS.map((u) => u.email) } },
      orderBy: { email: "asc" }
    });
    await this.prisma.friendship.createMany({
      data: synthetic.map((s) => (s.id < user.id ? { userAId: s.id, userBId: user.id } : { userAId: user.id, userBId: s.id })),
      skipDuplicates: true
    });
    const group = await this.prisma.group.create({
      data: {
        name: DEMO_GUEST_GROUP_NAME,
        timezone: timezone || this.config.demoTimezone,
        ownerId: user.id,
        inviteCode: await uniqueCode(async (code) => (await this.prisma.group.count({ where: { inviteCode: code } })) > 0),
        members: {
          create: [
            { userId: user.id, role: "OWNER" as const },
            ...synthetic.map((s) => ({ userId: s.id, role: "MEMBER" as const }))
          ]
        }
      }
    });
    await ensureDemoChallenges(this.prisma, group, [user, ...synthetic], user.id, now);
    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  }

  /** Deletes demo guests older than GUEST_MAX_AGE_DAYS together with their private groups. Returns the count. */
  async cleanupGuests(now: Date = this.clock.now()): Promise<number> {
    const cutoff = new Date(now.getTime() - GUEST_MAX_AGE_DAYS * 86_400_000);
    const guests = await this.prisma.user.findMany({
      where: {
        isDemo: true,
        email: { endsWith: "@demo.steppy.app", notIn: SYNTHETIC_USERS.map((u) => u.email) },
        createdAt: { lt: cutoff }
      },
      select: { id: true }
    });
    let deleted = 0;
    for (const { id } of guests) {
      try {
        await this.account.deleteAccount(id);
        deleted++;
      } catch (error) {
        this.logger.error(`failed to delete demo guest ${id}: ${String(error)}`);
      }
    }
    return deleted;
  }

  /** Adds a plausible amount of steps (scaled by local time of day, none at night) to today's value of the seeded synthetic users only (never guests). */
  async tick(now: Date = this.clock.now()): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { isDemo: true, email: { in: [DEMO_CAPTAIN.email, ...SYNTHETIC_USERS.map((u) => u.email)] } }
    });
    let updated = 0;
    for (const user of users) {
      const minute = localMinuteOfDay(now, user.timezone);
      const weight = minuteWeight(minute);
      if (weight === 0) continue;
      const today = localDateInZone(now, user.timezone);
      const target = dayTotal(profileFor(user), user.id, today);
      const increment = Math.round((target * weight * (0.4 + Math.random() * 1.2)) / TOTAL_WEIGHT);
      if (increment < 1) continue;
      const row = await this.prisma.dailySteps.findUnique({ where: { userId_date: { userId: user.id, date: today } } });
      const current = row?.steps ?? 0;
      if (current >= target * 1.1) continue;
      const steps = Math.min(200_000, current + increment);
      await this.prisma.dailySteps.upsert({
        where: { userId_date: { userId: user.id, date: today } },
        create: { userId: user.id, date: today, steps, source: "DEMO", timezone: user.timezone },
        update: { steps }
      });
      await this.prisma.user.update({ where: { id: user.id }, data: { lastSyncedAt: now, stepSource: "DEMO" } });
      const memberships = await this.prisma.groupMember.findMany({ where: { userId: user.id }, select: { groupId: true } });
      for (const { groupId } of memberships) {
        this.realtime.emitToGroup(groupId, "steps.updated", { groupId, userId: user.id, dates: [today], lastSyncedAt: now.toISOString() });
      }
      updated++;
    }
    return updated;
  }
}
