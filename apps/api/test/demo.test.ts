import { afterAll, describe, expect, it } from "vitest";
import { DemoService } from "../src/demo/demo.service.js";
import { DEMO_GROUP_NAME, DEMO_PASSWORD } from "../src/demo/profiles.js";
import { seedDemo } from "../src/demo/seed.js";
import { api, createTestApp, type TestCtx } from "./helpers.js";

const open: TestCtx[] = [];
afterAll(async () => {
  for (const c of open) await c.close();
});

describe("demo mode disabled", () => {
  it("POST /auth/demo is 404", async () => {
    const ctx = await createTestApp({ config: { demoMode: false } });
    open.push(ctx);
    const res = await api(ctx).post("/auth/demo", undefined, { timezone: "UTC" });
    expect(res.status).toBe(404);
  });
});

describe("demo mode enabled", () => {
  it("creates a demo user in the seeded group with friends, history and challenges", async () => {
    const ctx = await createTestApp({ config: { demoMode: true, demoTimezone: "America/Los_Angeles" } });
    open.push(ctx);
    const http = api(ctx);
    const res = await http.post("/auth/demo", undefined, { displayName: "Tester", timezone: "America/Los_Angeles" });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ displayName: "Tester", stepSource: null, lastSyncedAt: null });
    const token = res.body.accessToken as string;

    const friends = await http.get("/friends", token);
    expect(friends.body.map((f: { displayName: string }) => f.displayName).sort()).toEqual(["Ava", "Ben", "Chloe", "Dev", "Eli"]);

    const groups = await http.get("/groups", token);
    expect(groups.body).toHaveLength(1);
    expect(groups.body[0]).toMatchObject({ name: DEMO_GROUP_NAME, memberCount: 7, timezone: "America/Los_Angeles", activeChallengeCount: 2 });

    const board = await http.get(`/groups/${groups.body[0].id}/leaderboard?period=quarter`, token);
    expect(board.body.entries).toHaveLength(7);
    for (const e of board.body.entries) {
      if (e.userId === res.body.user.id) expect(e).toMatchObject({ steps: 0, daysWithData: 0 }); // guests start empty
      else expect(e.daysWithData).toBeGreaterThanOrEqual(85);
    }
    expect(await ctx.prisma.dailySteps.count({ where: { userId: res.body.user.id } })).toBe(0);

    const challenges = await http.get(`/groups/${groups.body[0].id}/challenges`, token);
    const statuses = challenges.body.map((c: { status: string; kind: string }) => `${c.kind}:${c.status}`).sort();
    expect(statuses).toEqual(["MONTHLY:ACTIVE", "WEEKLY:ACTIVE", "WEEKLY:FINISHED"]);
    const finished = challenges.body.find((c: { status: string }) => c.status === "FINISHED");
    expect(finished.leaderIds).toHaveLength(1);
    const active = challenges.body.filter((c: { status: string }) => c.status === "ACTIVE");
    expect(active.every((c: { participantCount: number }) => c.participantCount === 7)).toBe(true);

    // a second demo login reuses the seeded group
    const second = await http.post("/auth/demo", undefined, { timezone: "Europe/Paris" });
    expect(second.status).toBe(201);
    expect(await ctx.prisma.group.count({ where: { name: DEMO_GROUP_NAME } })).toBe(1);
  });

  it("seed is idempotent and provides the captain account", async () => {
    const ctx = await createTestApp({ config: { demoMode: true, demoTimezone: "America/Los_Angeles" } });
    open.push(ctx);
    const http = api(ctx);
    const now = ctx.clock.now();
    await seedDemo(ctx.prisma, { now, timezone: "America/Los_Angeles" });
    await seedDemo(ctx.prisma, { now, timezone: "America/Los_Angeles" });
    expect(await ctx.prisma.user.count()).toBe(6);
    expect(await ctx.prisma.group.count()).toBe(1);
    expect(await ctx.prisma.challenge.count()).toBe(3);
    expect(await ctx.prisma.friendship.count()).toBe(15);
    const login = await http.post("/auth/login", undefined, { email: "demo@steppy.app", password: DEMO_PASSWORD });
    expect(login.status).toBe(200);
    const ava = await http.post("/auth/login", undefined, { email: "ava@demo.steppy.app", password: DEMO_PASSWORD });
    expect(ava.status).toBe(200);
  });

  it("ticker adds steps during the day and nothing at night", async () => {
    const ctx = await createTestApp({ config: { demoMode: true, demoTimezone: "America/Los_Angeles" } });
    open.push(ctx);
    const http = api(ctx);
    const demoLogin = await http.post("/auth/demo", undefined, { timezone: "America/Los_Angeles" });
    expect(demoLogin.status).toBe(201);
    const demo = ctx.app.get(DemoService);
    const sumToday = async () =>
      (await ctx.prisma.dailySteps.aggregate({ _sum: { steps: true }, where: { date: "2026-10-14" } }))._sum.steps ?? 0;

    // 12:00 UTC = 05:00 PDT: night, nothing happens
    ctx.clock.set("2026-10-14T12:00:00Z");
    expect(await demo.tick()).toBe(0);

    // 16:00 PDT, daytime
    ctx.clock.set("2026-10-14T23:00:00Z");
    const before = await sumToday();
    const updated = await demo.tick();
    expect(updated).toBe(6); // the captain and five synthetic friends, never the guest
    expect(await sumToday()).toBeGreaterThan(before);
    expect(await ctx.prisma.dailySteps.count({ where: { userId: demoLogin.body.user.id } })).toBe(0);
  });
});
