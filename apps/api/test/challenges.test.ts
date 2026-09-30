import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChallengesService } from "../src/challenges/challenges.service.js";
import { api, createTestApp, NOON, type TestCtx } from "./helpers.js";

let ctx: TestCtx;
let http: ReturnType<typeof api>;
beforeAll(async () => {
  ctx = await createTestApp(); // Wed 2026-10-14 12:00 UTC
  http = api(ctx);
});
afterAll(() => ctx.close());

async function setup() {
  ctx.clock.set(NOON);
  const ann = await http.register("Ann");
  const ben = await http.register("Ben");
  const cy = await http.register("Cy");
  const g = await http.createGroup(ann, "Crew", "UTC");
  await http.joinGroup(ben, g.inviteCode);
  await http.joinGroup(cy, g.inviteCode);
  return { ann, ben, cy, g };
}

describe("challenge creation", () => {
  it("creates weekly and monthly challenges with contract windows and default names", async () => {
    const { ann, g } = await setup();
    const weekly = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY" });
    expect(weekly.status).toBe(201);
    expect(weekly.body).toMatchObject({
      name: "Weekly challenge · Oct 14",
      kind: "WEEKLY",
      startDate: "2026-10-14",
      endDate: "2026-10-20",
      status: "ACTIVE",
      participantCount: 3,
      timezone: "UTC",
      createdById: ann.id,
      winnerIds: [],
      leaderIds: []
    });
    expect(weekly.body.days).toEqual(["2026-10-14"]);
    const monthly = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "MONTHLY", startDate: "2026-10-20", name: "Big one" });
    expect(monthly.body).toMatchObject({ name: "Big one", startDate: "2026-10-20", endDate: "2026-11-19", status: "UPCOMING", days: [] });
    const list = await http.get(`/groups/${g.id}/challenges`, ann.token);
    expect(list.body.map((c: { id: string }) => c.id)).toEqual([monthly.body.id, weekly.body.id]);
    expect((await http.get(`/groups/${g.id}`, ann.token)).body.activeChallengeCount).toBe(1);
  });

  it("rejects past start dates, invalid dates and non-member participants", async () => {
    const { ann, g } = await setup();
    const outsider = await http.register("Zed");
    expect((await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY", startDate: "2026-10-13" })).status).toBe(400);
    expect((await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY", startDate: "2026-02-31" })).status).toBe(400);
    expect((await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "DAILY" })).status).toBe(400);
    const res = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY", participantIds: [outsider.id] });
    expect(res.status).toBe(400);
    expect((await http.post(`/groups/${g.id}/challenges`, outsider.token, { kind: "WEEKLY" })).status).toBe(404);
  });

  it("uses the group's today for the past check and always includes the creator", async () => {
    const { ann, ben, g } = await setup();
    const res = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY", participantIds: [ben.id] });
    expect(res.status).toBe(201);
    expect(res.body.standings.map((s: { userId: string }) => s.userId).sort()).toEqual([ann.id, ben.id].sort());
  });
});

describe("standings, join and leave", () => {
  it("sums steps from startDate..today for participants and ranks with ties", async () => {
    const { ann, ben, cy, g } = await setup();
    await http.upload(ann, [{ date: "2026-10-13", steps: 9000 }]); // before the window
    const created = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY", participantIds: [ann.id, ben.id] });
    const id = created.body.id as string;
    await http.upload(ann, [{ date: "2026-10-14", steps: 4000 }]);
    await http.upload(ben, [{ date: "2026-10-14", steps: 4000 }]);
    await http.upload(cy, [{ date: "2026-10-14", steps: 8000 }]); // not a participant
    const detail = await http.get(`/challenges/${id}`, cy.token);
    expect(detail.status).toBe(200);
    expect(detail.body.standings.map((s: { displayName: string; rank: number; steps: number }) => [s.displayName, s.rank, s.steps])).toEqual([
      ["Ann", 1, 4000],
      ["Ben", 1, 4000]
    ]);
    expect(detail.body.leaderIds.sort()).toEqual([ann.id, ben.id].sort());
    expect(detail.body.days).toEqual(["2026-10-14"]);
    expect(detail.body.daily).toHaveLength(2);
    expect(detail.body.daily[0].steps).toEqual([4000]);

    ctx.clock.set("2026-10-15T12:00:00Z");
    await http.upload(ben, [{ date: "2026-10-15", steps: 1 }]);
    const next = await http.get(`/challenges/${id}`, ann.token);
    expect(next.body.days).toEqual(["2026-10-14", "2026-10-15"]);
    expect(next.body.standings[0]).toMatchObject({ displayName: "Ben", rank: 1, steps: 4001 });
    expect(next.body.standings[1]).toMatchObject({ displayName: "Ann", rank: 2, steps: 4000 });
    expect(next.body.daily.find((d: { userId: string }) => d.userId === ann.id).steps).toEqual([4000, null]);
    const list = await http.get(`/groups/${g.id}/challenges`, ann.token);
    expect(list.body[0].leaderIds).toEqual([ben.id]);
    ctx.clock.set(NOON);
  });

  it("lets members join and leave while upcoming or active; hides from non-members", async () => {
    const { ann, ben, cy, g } = await setup();
    const created = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY", participantIds: [ann.id] });
    const id = created.body.id as string;
    const joined = await http.post(`/challenges/${id}/join`, ben.token);
    expect(joined.status).toBe(200);
    expect(joined.body.participantCount).toBe(2);
    expect((await http.post(`/challenges/${id}/join`, ben.token)).body.participantCount).toBe(2);
    const left = await http.post(`/challenges/${id}/leave`, ben.token);
    expect(left.status).toBe(200);
    expect(left.body.participantCount).toBe(1);
    expect((await http.post(`/challenges/${id}/leave`, ben.token)).body.participantCount).toBe(1);

    const outsider = await http.register("Zed");
    expect((await http.get(`/challenges/${id}`, outsider.token)).status).toBe(404);
    expect((await http.post(`/challenges/${id}/join`, outsider.token)).status).toBe(404);
    expect((await http.get("/challenges/nope", cy.token)).status).toBe(404);

    const upcoming = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "MONTHLY", startDate: "2026-11-01", participantIds: [ann.id] });
    expect((await http.post(`/challenges/${upcoming.body.id}/join`, cy.token)).body.participantCount).toBe(2);

    // SETTLING (ended, not yet settled): closed
    ctx.clock.set("2026-10-21T09:00:00Z");
    expect((await http.post(`/challenges/${id}/join`, cy.token)).status).toBe(400);
    expect((await http.post(`/challenges/${id}/leave`, ann.token)).status).toBe(400);
    ctx.clock.set(NOON);
  });
});

describe("finalizer", () => {
  it("stores winners (with ties) only once the last day settles, and emits nothing before", async () => {
    const { ann, ben, cy, g } = await setup();
    const created = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY" }); // 10-14..10-20
    const id = created.body.id as string;
    ctx.clock.set("2026-10-16T12:00:00Z");
    await http.upload(ann, [{ date: "2026-10-15", steps: 9000 }]);
    await http.upload(ben, [{ date: "2026-10-15", steps: 9000 }]);
    await http.upload(cy, [{ date: "2026-10-15", steps: 5000 }]);

    const finalizer = ctx.app.get(ChallengesService);
    ctx.clock.set("2026-10-21T09:59:00Z");
    expect(await finalizer.finalizeDue()).toBe(0);
    let detail = await http.get(`/challenges/${id}`, ann.token);
    expect(detail.body.status).toBe("SETTLING");
    expect(detail.body.winnerIds).toEqual([]);
    expect((await ctx.prisma.challenge.findUniqueOrThrow({ where: { id } })).finalizedAt).toBeNull();

    ctx.clock.set("2026-10-21T10:00:00Z");
    expect(await finalizer.finalizeDue()).toBe(1);
    expect(await finalizer.finalizeDue()).toBe(0); // idempotent
    const row = await ctx.prisma.challenge.findUniqueOrThrow({ where: { id } });
    expect(row.finalizedAt).not.toBeNull();
    expect([...row.winnerIds].sort()).toEqual([ann.id, ben.id].sort());
    detail = await http.get(`/challenges/${id}`, cy.token);
    expect(detail.body.status).toBe("FINISHED");
    expect([...detail.body.winnerIds].sort()).toEqual([ann.id, ben.id].sort());
    expect(detail.body.standings[2]).toMatchObject({ displayName: "Cy", rank: 3, steps: 5000 });
    expect((await http.post(`/challenges/${id}/join`, cy.token)).status).toBe(400);
    ctx.clock.set(NOON);
  });

  it("finalizes on read, with an empty winner list when nobody has steps", async () => {
    const { ann, g } = await setup();
    const created = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY" });
    ctx.clock.set("2026-10-25T12:00:00Z");
    const list = await http.get(`/groups/${g.id}/challenges`, ann.token);
    expect(list.body[0]).toMatchObject({ status: "FINISHED", leaderIds: [] });
    const row = await ctx.prisma.challenge.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.finalizedAt).not.toBeNull();
    expect(row.winnerIds).toEqual([]);
    ctx.clock.set(NOON);
  });

  it("keeps a single winner's steps frozen in the result even if data changes later", async () => {
    const { ann, ben, g } = await setup();
    const created = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY" });
    ctx.clock.set("2026-10-15T12:00:00Z");
    await http.upload(ann, [{ date: "2026-10-14", steps: 100 }]);
    await http.upload(ben, [{ date: "2026-10-14", steps: 50 }]);
    ctx.clock.set("2026-10-22T12:00:00Z");
    const finished = await http.get(`/challenges/${created.body.id}`, ben.token);
    expect(finished.body.winnerIds).toEqual([ann.id]);
    expect(finished.body.leaderIds).toEqual([ann.id]);
    ctx.clock.set(NOON);
  });

  it("emits group.updated settled via the finalizer", async () => {
    const { ann, g } = await setup();
    const created = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY" });
    ctx.clock.set("2026-10-21T10:00:00Z");
    const { RealtimeService } = await import("../src/realtime/realtime.service.js");
    const events: Array<[string, unknown]> = [];
    const realtime = ctx.app.get(RealtimeService);
    const original = realtime.emitToGroup.bind(realtime);
    realtime.emitToGroup = ((groupId: string, event: string, payload: unknown) => {
      events.push([event, payload]);
      return original(groupId, event as never, payload as never);
    }) as typeof realtime.emitToGroup;
    await ctx.app.get(ChallengesService).finalizeDue();
    realtime.emitToGroup = original;
    expect(events).toEqual([["group.updated", { groupId: g.id, reason: "settled" }]]);
    expect(created.status).toBe(201);
    ctx.clock.set(NOON);
  });
});
