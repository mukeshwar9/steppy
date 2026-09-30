import { afterAll, describe, expect, it } from "vitest";
import { DemoService } from "../src/demo/demo.service.js";
import { DEMO_GROUP_NAME, DEMO_GUEST_GROUP_NAME, DEMO_PASSWORD } from "../src/demo/profiles.js";
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
  it("gives each guest a private demo group with the synthetic friends, history and challenges", async () => {
    const ctx = await createTestApp({ config: { demoMode: true, demoTimezone: "America/Los_Angeles" } });
    open.push(ctx);
    const http = api(ctx);
    const res = await http.post("/auth/demo", undefined, { displayName: "Tester", timezone: "Europe/Paris" });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ displayName: "Tester", stepSource: null, lastSyncedAt: null });
    const token = res.body.accessToken as string;

    const friends = await http.get("/friends", token);
    expect(friends.body.map((f: { displayName: string }) => f.displayName).sort()).toEqual(["Ava", "Ben", "Chloe", "Dev", "Eli"]);

    const groups = await http.get("/groups", token);
    expect(groups.body).toHaveLength(1);
    expect(groups.body[0]).toMatchObject({
      name: DEMO_GUEST_GROUP_NAME,
      memberCount: 6,
      timezone: "Europe/Paris",
      ownerId: res.body.user.id,
      activeChallengeCount: 2
    });
    const groupId = groups.body[0].id as string;

    const detail = await http.get(`/groups/${groupId}`, token);
    const names = detail.body.members.map((m: { displayName: string }) => m.displayName).sort();
    expect(names).toEqual(["Ava", "Ben", "Chloe", "Dev", "Eli", "Tester"]); // no captain

    const board = await http.get(`/groups/${groupId}/leaderboard?period=quarter`, token);
    expect(board.body.entries).toHaveLength(6);
    for (const e of board.body.entries) {
      if (e.userId === res.body.user.id) expect(e).toMatchObject({ steps: 0, daysWithData: 0 }); // guests start empty
      else expect(e.daysWithData).toBeGreaterThanOrEqual(85);
    }
    expect(await ctx.prisma.dailySteps.count({ where: { userId: res.body.user.id } })).toBe(0);

    const challenges = await http.get(`/groups/${groupId}/challenges`, token);
    const statuses = challenges.body.map((c: { status: string; kind: string }) => `${c.kind}:${c.status}`).sort();
    expect(statuses).toEqual(["MONTHLY:ACTIVE", "WEEKLY:ACTIVE", "WEEKLY:FINISHED"]);
    const finished = challenges.body.find((c: { status: string }) => c.status === "FINISHED");
    expect(finished.leaderIds).toHaveLength(1);
    const finishedDetail = await http.get(`/challenges/${finished.id}`, token);
    expect(finishedDetail.body.standings).toHaveLength(6);
    const active = challenges.body.filter((c: { status: string }) => c.status === "ACTIVE");
    expect(active.every((c: { participantCount: number }) => c.participantCount === 6)).toBe(true);
  });

  it("guests do not see each other; the shared seeded group stays for the captain only", async () => {
    const ctx = await createTestApp({ config: { demoMode: true, demoTimezone: "America/Los_Angeles" } });
    open.push(ctx);
    const http = api(ctx);
    const one = await http.post("/auth/demo", undefined, { displayName: "One", timezone: "UTC" });
    const two = await http.post("/auth/demo", undefined, { displayName: "Two", timezone: "UTC" });
    expect(one.status).toBe(201);
    expect(two.status).toBe(201);

    const g1 = (await http.get("/groups", one.body.accessToken)).body;
    const g2 = (await http.get("/groups", two.body.accessToken)).body;
    expect(g1).toHaveLength(1);
    expect(g2).toHaveLength(1);
    expect(g1[0].id).not.toBe(g2[0].id);
    expect(g1[0].inviteCode).not.toBe(g2[0].inviteCode);
    const members1 = (await http.get(`/groups/${g1[0].id}`, one.body.accessToken)).body.members.map((m: { displayName: string }) => m.displayName);
    expect(members1).not.toContain("Two");
    expect((await http.get(`/groups/${g2[0].id}`, one.body.accessToken)).status).toBe(404);
    expect((await http.get("/friends", one.body.accessToken)).body.map((f: { displayName: string }) => f.displayName)).not.toContain("Two");

    // the shared group holds only the captain and the synthetic users
    expect(await ctx.prisma.group.count({ where: { name: DEMO_GROUP_NAME } })).toBe(1);
    expect(await ctx.prisma.groupMember.count({ where: { group: { name: DEMO_GROUP_NAME } } })).toBe(6);
    const captain = await http.post("/auth/login", undefined, { email: "demo@steppy.app", password: DEMO_PASSWORD });
    const captainGroups = (await http.get("/groups", captain.body.accessToken)).body;
    expect(captainGroups).toHaveLength(1);
    expect(captainGroups[0]).toMatchObject({ name: DEMO_GROUP_NAME, memberCount: 6 });
  });

  it("cleanup deletes guests older than 7 days with their private groups, and nothing else", async () => {
    const ctx = await createTestApp({ config: { demoMode: true, demoTimezone: "America/Los_Angeles" } });
    open.push(ctx);
    const http = api(ctx);
    const old = await http.post("/auth/demo", undefined, { displayName: "Old", timezone: "UTC" });
    const young = await http.post("/auth/demo", undefined, { displayName: "Young", timezone: "UTC" });
    const now = ctx.clock.now();
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    await ctx.prisma.user.update({ where: { id: old.body.user.id }, data: { createdAt: days(8) } });
    await ctx.prisma.user.update({ where: { id: young.body.user.id }, data: { createdAt: days(6) } });
    const regular = await http.register("Regular");
    await ctx.prisma.user.update({ where: { id: regular.id }, data: { createdAt: days(400) } });
    const demo = ctx.app.get(DemoService);

    expect(await ctx.prisma.group.count({ where: { name: DEMO_GUEST_GROUP_NAME } })).toBe(2);
    expect(await demo.cleanupGuests(now)).toBe(1);
    expect(await ctx.prisma.user.count({ where: { id: old.body.user.id } })).toBe(0);
    expect(await ctx.prisma.group.count({ where: { name: DEMO_GUEST_GROUP_NAME } })).toBe(1);
    expect(await ctx.prisma.user.count({ where: { id: young.body.user.id } })).toBe(1);
    expect(await ctx.prisma.user.count({ where: { id: regular.id } })).toBe(1);
    // synthetic users, the captain and the shared group survive
    expect(await ctx.prisma.user.count({ where: { email: { endsWith: "@demo.steppy.app" } } })).toBe(6); // five synthetic + young guest
    expect(await ctx.prisma.group.count({ where: { name: DEMO_GROUP_NAME } })).toBe(1);
    expect((await http.get("/me", old.body.accessToken)).status).toBe(401);
    const groups = await http.get("/groups", young.body.accessToken);
    expect(groups.body[0]).toMatchObject({ memberCount: 6, activeChallengeCount: 2 });
    expect(await demo.cleanupGuests(now)).toBe(0);

    // a week later the young guest goes too
    expect(await demo.cleanupGuests(new Date(now.getTime() + 2 * 86_400_000))).toBe(1);
    expect(await ctx.prisma.group.count({ where: { name: DEMO_GUEST_GROUP_NAME } })).toBe(0);
    expect(await ctx.prisma.challenge.count()).toBe(3); // only the seeded group's challenges remain
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
