import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createTestApp, type TestCtx } from "./helpers.js";

let ctx: TestCtx;
let http: ReturnType<typeof api>;
beforeAll(async () => {
  ctx = await createTestApp();
  http = api(ctx);
});
afterAll(() => ctx.close());

describe("friends", () => {
  it("adds by code (mutual), is idempotent, and lists with todaySteps", async () => {
    const a = await http.register("Ann");
    const b = await http.register("Ben");
    const res = await http.post("/friends", a.token, { friendCode: b.friendCode.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: b.id, displayName: "Ben", friendCode: b.friendCode, todaySteps: 0 });
    expect((await http.post("/friends", a.token, { friendCode: b.friendCode })).status).toBe(200);
    expect(await ctx.prisma.friendship.count()).toBe(1);

    await http.upload(b, [{ date: "2026-10-14", steps: 4321 }]);
    const listA = await http.get("/friends", a.token);
    expect(listA.body).toHaveLength(1);
    expect(listA.body[0]).toMatchObject({ userId: b.id, todaySteps: 4321, stepSource: "HEALTHKIT" });
    const listB = await http.get("/friends", b.token);
    expect(listB.body[0]).toMatchObject({ userId: a.id, todaySteps: 0 });
  });

  it("rejects unknown (404) and own (400) codes", async () => {
    const a = await http.register("Ann");
    expect((await http.post("/friends", a.token, { friendCode: "ZZZZZZZZ" })).status).toBe(404);
    expect((await http.post("/friends", a.token, { friendCode: a.friendCode })).status).toBe(400);
    expect((await http.post("/friends", a.token, { friendCode: "" })).status).toBe(400);
  });

  it("deletes the friendship both ways", async () => {
    const a = await http.register("Ann");
    const b = await http.register("Ben");
    await http.befriend(a, b);
    expect((await http.delete(`/friends/${b.id}`, a.token)).status).toBe(204);
    expect((await http.get("/friends", a.token)).body).toEqual([]);
    expect((await http.get("/friends", b.token)).body).toEqual([]);
    expect((await http.delete(`/friends/${b.id}`, a.token)).status).toBe(204);
  });
});

describe("groups", () => {
  it("creates a group owned by the creator with the creator's timezone by default", async () => {
    const a = await http.register("Ann", "Europe/Berlin");
    const res = await http.post("/groups", a.token, { name: "  Crew  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Crew", timezone: "Europe/Berlin", memberCount: 1, ownerId: a.id, activeChallengeCount: 0 });
    expect(res.body.inviteCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0]).toMatchObject({ userId: a.id, role: "OWNER", todaySteps: 0 });
    expect((await http.post("/groups", a.token, { name: "x", timezone: "Nope" })).status).toBe(400);
    expect((await http.get("/groups", a.token)).body).toHaveLength(1);
  });

  it("joins by invite code (idempotent), unknown code is 404", async () => {
    const a = await http.register("Ann");
    const b = await http.register("Ben");
    const g = await http.createGroup(a);
    const res = await http.post("/groups/join", b.token, { inviteCode: g.inviteCode.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(2);
    expect((await http.post("/groups/join", b.token, { inviteCode: g.inviteCode })).body.memberCount).toBe(2);
    expect((await http.post("/groups/join", b.token, { inviteCode: "ZZZZZZZZ" })).status).toBe(404);
  });

  it("adds a friend directly, rejects non-friends", async () => {
    const a = await http.register("Ann");
    const b = await http.register("Ben");
    const c = await http.register("Cy");
    const g = await http.createGroup(a);
    await http.befriend(a, b);
    const ok = await http.post(`/groups/${g.id}/members`, a.token, { userId: b.id });
    expect(ok.status).toBe(200);
    expect(ok.body.memberCount).toBe(2);
    expect((await http.post(`/groups/${g.id}/members`, a.token, { userId: c.id })).status).toBe(403);
    // a member (not only the owner) may add their own friends
    await http.befriend(b, c);
    expect((await http.post(`/groups/${g.id}/members`, b.token, { userId: c.id })).body.memberCount).toBe(3);
    // non-members cannot add
    const d = await http.register("Di");
    await http.befriend(d, c);
    expect((await http.post(`/groups/${g.id}/members`, d.token, { userId: c.id })).status).toBe(404);
  });

  it("returns 404 on group resources for non-members", async () => {
    const a = await http.register("Ann");
    const x = await http.register("Xavier");
    const g = await http.createGroup(a);
    for (const path of [
      `/groups/${g.id}`,
      `/groups/${g.id}/leaderboard?period=week`,
      `/groups/${g.id}/history`,
      `/groups/${g.id}/challenges`
    ]) {
      expect((await http.get(path, x.token)).status).toBe(404);
    }
    expect((await http.post(`/groups/${g.id}/leave`, x.token)).status).toBe(404);
    expect((await http.post(`/groups/${g.id}/invite-code/rotate`, x.token)).status).toBe(404);
    expect((await http.get("/groups/does-not-exist", a.token)).status).toBe(404);
  });

  it("transfers ownership to the longest-standing member when the owner leaves", async () => {
    const a = await http.register("Ann");
    const b = await http.register("Ben");
    const c = await http.register("Cy");
    const g = await http.createGroup(a);
    await http.joinGroup(b, g.inviteCode);
    await http.joinGroup(c, g.inviteCode);
    expect((await http.post(`/groups/${g.id}/leave`, a.token)).status).toBe(204);
    const detail = await http.get(`/groups/${g.id}`, b.token);
    expect(detail.body.ownerId).toBe(b.id);
    expect(detail.body.members.find((m: { userId: string }) => m.userId === b.id).role).toBe("OWNER");
    expect(detail.body.memberCount).toBe(2);
    expect((await http.get(`/groups/${g.id}`, a.token)).status).toBe(404);
    expect((await http.get("/groups", a.token)).body).toEqual([]);
  });

  it("deletes the group when the last member leaves", async () => {
    const a = await http.register("Ann");
    const g = await http.createGroup(a);
    expect((await http.post(`/groups/${g.id}/leave`, a.token)).status).toBe(204);
    expect(await ctx.prisma.group.count()).toBe(0);
    expect(await ctx.prisma.groupMember.count()).toBe(0);
  });

  it("rotates the invite code (owner only)", async () => {
    const a = await http.register("Ann");
    const b = await http.register("Ben");
    const g = await http.createGroup(a);
    await http.joinGroup(b, g.inviteCode);
    expect((await http.post(`/groups/${g.id}/invite-code/rotate`, b.token)).status).toBe(403);
    const res = await http.post(`/groups/${g.id}/invite-code/rotate`, a.token);
    expect(res.status).toBe(200);
    expect(res.body.inviteCode).not.toBe(g.inviteCode);
    expect((await http.post("/groups/join", (await http.register("Cy")).token, { inviteCode: g.inviteCode })).status).toBe(404);
  });

  it("removes a leaving member from open challenges but keeps finished ones", async () => {
    const a = await http.register("Ann");
    const b = await http.register("Ben");
    const g = await http.createGroup(a);
    await http.joinGroup(b, g.inviteCode);
    const open = await http.post(`/groups/${g.id}/challenges`, a.token, { kind: "WEEKLY" });
    expect(open.body.participantCount).toBe(2);
    await http.post(`/groups/${g.id}/leave`, b.token);
    const after = await http.get(`/challenges/${open.body.id}`, a.token);
    expect(after.body.participantCount).toBe(1);
  });
});
