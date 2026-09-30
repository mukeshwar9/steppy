import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createTestApp, type TestCtx } from "./helpers.js";

let ctx: TestCtx;
let http: ReturnType<typeof api>;
beforeAll(async () => {
  ctx = await createTestApp(); // 2026-10-14 12:00 UTC
  http = api(ctx);
});
afterAll(() => ctx.close());

const body = (days: Array<{ date: string; steps: number }>, extra: object = {}) => ({
  source: "HEALTHKIT",
  timezone: "UTC",
  reason: "foreground",
  days,
  ...extra
});

describe("PUT /steps", () => {
  it("accepts new days, updates unsettled days and records sync metadata", async () => {
    const a = await http.register("Ann");
    const first = await http.put("/steps", a.token, body([{ date: "2026-10-14", steps: 500 }]));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ accepted: ["2026-10-14"], frozen: [], lastSyncedAt: "2026-10-14T12:00:00.000Z" });
    const again = await http.put("/steps", a.token, body([{ date: "2026-10-14", steps: 900 }]));
    expect(again.body.accepted).toEqual(["2026-10-14"]);
    const list = await http.get("/me/steps?from=2026-10-14&to=2026-10-14", a.token);
    expect(list.body).toEqual([
      { date: "2026-10-14", steps: 900, source: "HEALTHKIT", settled: false, updatedAt: expect.any(String) }
    ]);
    const me = await http.get("/me", a.token);
    expect(me.body).toMatchObject({ stepSource: "HEALTHKIT", lastSyncedAt: "2026-10-14T12:00:00.000Z" });
  });

  it("accepts first-time values for settled days (backfill) but freezes them afterwards", async () => {
    const a = await http.register("Ann");
    const backfill = await http.put("/steps", a.token, body([
      { date: "2026-10-10", steps: 1000 },
      { date: "2026-10-13", steps: 2000 },
      { date: "2026-10-14", steps: 3000 }
    ], { reason: "backfill" }));
    expect(backfill.body.accepted).toEqual(["2026-10-10", "2026-10-13", "2026-10-14"]);
    expect(backfill.body.frozen).toEqual([]);

    const second = await http.put("/steps", a.token, body([
      { date: "2026-10-10", steps: 9999 },
      { date: "2026-10-13", steps: 9999 },
      { date: "2026-10-14", steps: 3500 },
      { date: "2026-10-09", steps: 700 }
    ]));
    expect(second.body.frozen).toEqual(["2026-10-10", "2026-10-13"]);
    expect(second.body.accepted).toEqual(["2026-10-09", "2026-10-14"]);
    const list = await http.get("/me/steps?from=2026-10-09&to=2026-10-14", a.token);
    expect(list.body.map((d: { date: string; steps: number; settled: boolean }) => [d.date, d.steps, d.settled])).toEqual([
      ["2026-10-09", 700, true],
      ["2026-10-10", 1000, true],
      ["2026-10-13", 2000, true],
      ["2026-10-14", 3500, false]
    ]);
  });

  it("settles a day at 10:00 local time the next day", async () => {
    const a = await http.register("Ann");
    ctx.clock.set("2026-10-14T09:59:00Z");
    await http.upload(a, [{ date: "2026-10-13", steps: 100 }]);
    expect((await http.upload(a, [{ date: "2026-10-13", steps: 200 }])).accepted).toEqual(["2026-10-13"]);
    ctx.clock.set("2026-10-14T10:00:00Z");
    const res = await http.upload(a, [{ date: "2026-10-13", steps: 300 }]);
    expect(res.frozen).toEqual(["2026-10-13"]);
    // other timezones settle at their own 10:00: Tokyo (UTC+9) 10:00 on 10-14 is 01:00Z
    ctx.clock.set("2026-10-14T00:59:00Z");
    await http.upload(a, [{ date: "2026-10-13", steps: 50 }], "Asia/Tokyo"); // accepted: row exists, but the day is unsettled in Tokyo
    const row = await ctx.prisma.dailySteps.findFirstOrThrow({ where: { userId: a.id, date: "2026-10-13" } });
    expect(row.steps).toBe(50);
    expect(row.timezone).toBe("Asia/Tokyo");
    ctx.clock.set(NOON_AGAIN);
  });

  it("updates user timezone and source from the request", async () => {
    const a = await http.register("Ann");
    await http.put("/steps", a.token, body([{ date: "2026-10-14", steps: 1 }], { source: "HEALTH_CONNECT", timezone: "America/New_York" }));
    expect((await http.get("/me", a.token)).body).toMatchObject({ stepSource: "HEALTH_CONNECT", timezone: "America/New_York" });
  });

  it("still updates lastSyncedAt when every day is frozen", async () => {
    const a = await http.register("Ann");
    await http.upload(a, [{ date: "2026-10-01", steps: 10 }]);
    ctx.clock.set("2026-10-14T13:00:00Z");
    const res = await http.upload(a, [{ date: "2026-10-01", steps: 20 }]);
    expect(res.accepted).toEqual([]);
    expect(res.frozen).toEqual(["2026-10-01"]);
    expect((await http.get("/me", a.token)).body.lastSyncedAt).toBe("2026-10-14T13:00:00.000Z");
    ctx.clock.set(NOON_AGAIN);
  });

  it("validates the payload", async () => {
    const a = await http.register("Ann");
    const cases: object[] = [
      body([]),
      body([{ date: "14-10-2026", steps: 1 }]),
      body([{ date: "2026-10-14", steps: -1 }]),
      body([{ date: "2026-10-14", steps: 1.5 }]),
      body([{ date: "2026-10-14", steps: 200_001 }]),
      body([{ date: "2026-10-14", steps: 1 }], { source: "FITBIT" }),
      body([{ date: "2026-02-31", steps: 1 }]),
      body([{ date: "2026-10-14", steps: 1 }], { timezone: "Mars/Base" }),
      body([{ date: "2027-01-01", steps: 1 }]),
      body(Array.from({ length: 121 }, (_, i) => ({ date: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`, steps: 1 })))
    ];
    for (const payload of cases) {
      const res = await http.put("/steps", a.token, payload);
      expect(res.status, JSON.stringify(payload).slice(0, 80)).toBe(400);
    }
    expect((await http.put("/steps", undefined, body([{ date: "2026-10-14", steps: 1 }]))).status).toBe(401);
  });

  it("GET /me/steps validates ranges", async () => {
    const a = await http.register("Ann");
    expect((await http.get("/me/steps?from=2026-01-01&to=2026-12-31", a.token)).status).toBe(400);
    expect((await http.get("/me/steps?from=2026-10-10&to=2026-10-01", a.token)).status).toBe(400);
    expect((await http.get("/me/steps?from=bad", a.token)).status).toBe(400);
    expect((await http.get("/me/steps", a.token)).status).toBe(200);
  });
});

const NOON_AGAIN = "2026-10-14T12:00:00Z";
