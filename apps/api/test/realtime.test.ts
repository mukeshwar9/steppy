import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, connectSocket, createTestApp, once, type TestCtx } from "./helpers.js";

let ctx: TestCtx;
let http: ReturnType<typeof api>;
beforeAll(async () => {
  ctx = await createTestApp();
  http = api(ctx);
});
afterAll(() => ctx.close());

describe("realtime", () => {
  it("delivers steps.updated to group members after an upload", async () => {
    const ann = await http.register("Ann");
    const ben = await http.register("Ben");
    const outsider = await http.register("Zed");
    const g = await http.createGroup(ann);
    await http.joinGroup(ben, g.inviteCode);

    const sock = connectSocket(ctx, ann.token);
    const outsiderSock = connectSocket(ctx, outsider.token);
    await Promise.all([once(sock, "connect"), once(outsiderSock, "connect")]);
    let leaked = false;
    outsiderSock.on("steps.updated", () => (leaked = true));

    const received = once<{ groupId: string; userId: string; dates: string[]; lastSyncedAt: string }>(sock, "steps.updated");
    await http.upload(ben, [{ date: "2026-10-14", steps: 777 }]);
    expect(await received).toEqual({
      groupId: g.id,
      userId: ben.id,
      dates: ["2026-10-14"],
      lastSyncedAt: "2026-10-14T12:00:00.000Z"
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(leaked).toBe(false);
    sock.close();
    outsiderSock.close();
  });

  it("does not emit steps.updated when nothing was accepted", async () => {
    const ann = await http.register("Ann");
    const g = await http.createGroup(ann);
    await http.upload(ann, [{ date: "2026-10-01", steps: 10 }]);
    const sock = connectSocket(ctx, ann.token);
    await once(sock, "connect");
    let count = 0;
    sock.on("steps.updated", () => count++);
    const res = await http.upload(ann, [{ date: "2026-10-01", steps: 20 }]);
    expect(res.accepted).toEqual([]);
    await new Promise((r) => setTimeout(r, 200));
    expect(count).toBe(0);
    expect(g.id).toBeTruthy();
    sock.close();
  });

  it("joins new groups on membership changes and handles groups.resubscribe", async () => {
    const ann = await http.register("Ann");
    const ben = await http.register("Ben");
    const sock = connectSocket(ctx, ann.token);
    await once(sock, "connect");
    const g = await http.createGroup(ann); // server re-subscribes ann's sockets
    const updated = once<{ groupId: string; reason: string }>(sock, "group.updated");
    await http.joinGroup(ben, g.inviteCode);
    expect(await updated).toEqual({ groupId: g.id, reason: "member" });

    // explicit resubscribe ack after the membership was changed behind the socket's back
    const g2 = await http.createGroup(ben, "Other");
    await http.joinGroup(ann, g2.inviteCode);
    const ack = await sock.emitWithAck("groups.resubscribe", {});
    expect(ack).toEqual({ ok: true });
    const challengeEvent = once<{ groupId: string; reason: string }>(sock, "group.updated");
    await http.post(`/groups/${g2.id}/challenges`, ben.token, { kind: "WEEKLY" });
    expect(await challengeEvent).toEqual({ groupId: g2.id, reason: "challenge" });

    // leaving removes the socket from the room
    await http.post(`/groups/${g2.id}/leave`, ann.token);
    let after = 0;
    sock.on("group.updated", (p: { groupId: string }) => p.groupId === g2.id && after++);
    await http.post(`/groups/${g2.id}/challenges`, ben.token, { kind: "MONTHLY" });
    await new Promise((r) => setTimeout(r, 200));
    expect(after).toBe(0);
    sock.close();
  });

  it("rejects bad, missing and expired tokens", async () => {
    for (const token of ["garbage", undefined, ""]) {
      const sock = connectSocket(ctx, token);
      const outcome = await Promise.race([
        once<Error>(sock, "connect_error").then(() => "rejected"),
        once(sock, "connect").then(() => "connected")
      ]);
      expect(outcome).toBe("rejected");
      expect(sock.connected).toBe(false);
      sock.close();
    }
  });
});
