import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, connectSocket, createTestApp, NOON, once, type TestCtx } from "./helpers.js";

let ctx: TestCtx;
let http: ReturnType<typeof api>;
beforeAll(async () => {
  ctx = await createTestApp(); // Wed 2026-10-14 12:00 UTC
  http = api(ctx);
});
afterAll(() => ctx.close());

describe("DELETE /me", () => {
  it("requires authentication", async () => {
    expect((await http.delete("/me")).status).toBe(401);
  });

  it("deletes the account and its data; the old token stops working", async () => {
    ctx.clock.set(NOON);
    const ann = await http.register("Ann");
    const ben = await http.register("Ben");
    await http.befriend(ann, ben);
    await http.upload(ann, [{ date: "2026-10-14", steps: 1000 }]);

    const res = await http.delete("/me", ann.token);
    expect(res.status).toBe(204);
    expect((await http.get("/me", ann.token)).status).toBe(401);
    expect((await http.get("/groups", ann.token)).status).toBe(401);
    expect((await http.delete("/me", ann.token)).status).toBe(401);
    expect((await http.post("/auth/refresh", undefined, { refreshToken: ann.refreshToken })).status).toBe(401);
    expect((await http.post("/auth/login", undefined, { email: ann.email, password: "secret123" })).status).toBe(401);

    expect(await ctx.prisma.user.count({ where: { id: ann.id } })).toBe(0);
    expect(await ctx.prisma.dailySteps.count({ where: { userId: ann.id } })).toBe(0);
    expect(await ctx.prisma.refreshToken.count({ where: { userId: ann.id } })).toBe(0);
    expect(await ctx.prisma.friendship.count()).toBe(0);
    expect((await http.get("/friends", ben.token)).body).toEqual([]);
    // the email can be registered again
    const again = await http.register("Ann");
    expect(again.id).not.toBe(ann.id);
  });

  it("transfers ownership, leaves open challenges and notifies the group", async () => {
    ctx.clock.set(NOON);
    const ann = await http.register("Ann");
    const ben = await http.register("Ben");
    const cy = await http.register("Cy");
    await http.befriend(ann, ben);
    const g = await http.createGroup(ann, "Crew", "UTC");
    await http.joinGroup(ben, g.inviteCode);
    await http.joinGroup(cy, g.inviteCode);
    const challenge = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY" });
    expect(challenge.body.participantCount).toBe(3);

    const sock = connectSocket(ctx, ben.token);
    await once(sock, "connect");
    const updated = once<{ groupId: string; reason: string }>(sock, "group.updated");
    expect((await http.delete("/me", ann.token)).status).toBe(204);
    expect(await updated).toEqual({ groupId: g.id, reason: "member" });
    sock.close();

    const detail = await http.get(`/groups/${g.id}`, ben.token);
    expect(detail.body).toMatchObject({ memberCount: 2, ownerId: ben.id });
    expect(detail.body.members.find((m: { userId: string }) => m.userId === ben.id).role).toBe("OWNER");
    const after = await http.get(`/challenges/${challenge.body.id}`, ben.token);
    expect(after.status).toBe(200);
    expect(after.body.participantCount).toBe(2);
    expect(after.body.standings.map((s: { userId: string }) => s.userId).sort()).toEqual([ben.id, cy.id].sort());
    // the challenge outlives its creator
    expect(after.body.createdById).toBe(ben.id);
    const lb = await http.get(`/groups/${g.id}/leaderboard?period=week`, cy.token);
    expect(lb.body.entries).toHaveLength(2);
  });

  it("deletes groups that become empty", async () => {
    const ann = await http.register("Ann");
    const g = await http.createGroup(ann);
    await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY" });
    expect((await http.delete("/me", ann.token)).status).toBe(204);
    expect(await ctx.prisma.group.count()).toBe(0);
    expect(await ctx.prisma.challenge.count()).toBe(0);
  });

  it("keeps challenges created by a user who left the group earlier", async () => {
    ctx.clock.set(NOON);
    const ann = await http.register("Ann");
    const ben = await http.register("Ben");
    const g = await http.createGroup(ann);
    await http.joinGroup(ben, g.inviteCode);
    const challenge = await http.post(`/groups/${g.id}/challenges`, ben.token, { kind: "WEEKLY" });
    await http.post(`/groups/${g.id}/leave`, ben.token);
    expect((await http.delete("/me", ben.token)).status).toBe(204);
    const after = await http.get(`/challenges/${challenge.body.id}`, ann.token);
    expect(after.status).toBe(200);
    expect(after.body.createdById).toBe(ann.id);
  });

  it("keeps finished challenges readable when the winner was deleted", async () => {
    ctx.clock.set(NOON);
    const ann = await http.register("Ann");
    const ben = await http.register("Ben");
    const g = await http.createGroup(ann, "Crew", "UTC");
    await http.joinGroup(ben, g.inviteCode);
    const challenge = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY" });
    await http.upload(ann, [{ date: "2026-10-14", steps: 9000 }]);
    await http.upload(ben, [{ date: "2026-10-14", steps: 4000 }]);

    ctx.clock.set("2026-10-22T12:00:00Z"); // well after the week ended
    const finished = await http.get(`/challenges/${challenge.body.id}`, ben.token);
    expect(finished.body).toMatchObject({ status: "FINISHED", winnerIds: [ann.id] });

    expect((await http.delete("/me", ann.token)).status).toBe(204);

    const detail = await http.get(`/challenges/${challenge.body.id}`, ben.token);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ status: "FINISHED", winnerIds: [ann.id], leaderIds: [ann.id] });
    expect(detail.body.standings.map((s: { displayName: string; steps: number }) => [s.displayName, s.steps])).toEqual([
      ["Ann", 9000],
      ["Ben", 4000]
    ]);
    const list = await http.get(`/groups/${g.id}/challenges`, ben.token);
    expect(list.status).toBe(200);
    expect(list.body[0]).toMatchObject({ status: "FINISHED", leaderIds: [ann.id] });
    expect((await http.get(`/groups/${g.id}`, ben.token)).status).toBe(200);
    ctx.clock.set(NOON);
  });

  it("finalizes a just-ended challenge before removing the user's result", async () => {
    ctx.clock.set(NOON);
    const ann = await http.register("Ann");
    const ben = await http.register("Ben");
    const g = await http.createGroup(ann, "Crew", "UTC");
    await http.joinGroup(ben, g.inviteCode);
    const challenge = await http.post(`/groups/${g.id}/challenges`, ann.token, { kind: "WEEKLY" });
    await http.upload(ann, [{ date: "2026-10-14", steps: 9000 }]);
    ctx.clock.set("2026-10-22T12:00:00Z"); // finished, but nobody has read it yet so it is not finalized
    expect((await ctx.prisma.challenge.findUniqueOrThrow({ where: { id: challenge.body.id } })).finalizedAt).toBeNull();
    expect((await http.delete("/me", ann.token)).status).toBe(204);
    const detail = await http.get(`/challenges/${challenge.body.id}`, ben.token);
    expect(detail.body.winnerIds).toEqual([ann.id]);
    expect(detail.body.standings[0]).toMatchObject({ displayName: "Ann", steps: 9000 });
    ctx.clock.set(NOON);
  });

  it("disconnects the user's sockets", async () => {
    const ann = await http.register("Ann");
    const sock = connectSocket(ctx, ann.token);
    await once(sock, "connect");
    const gone = once(sock, "disconnect");
    expect((await http.delete("/me", ann.token)).status).toBe(204);
    await gone;
    expect(sock.connected).toBe(false);
    sock.close();
  });
});
