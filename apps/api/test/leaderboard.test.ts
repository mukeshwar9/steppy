import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createTestApp, type Session, type TestCtx } from "./helpers.js";

let ctx: TestCtx;
let http: ReturnType<typeof api>;
beforeAll(async () => {
  ctx = await createTestApp(); // Wed 2026-10-14 12:00 UTC; week starts Mon 10-12
  http = api(ctx);
});
afterAll(() => ctx.close());

async function setup() {
  const ann = await http.register("Ann");
  const ben = await http.register("Ben");
  const cy = await http.register("Cy");
  const g = await http.createGroup(ann, "Crew", "UTC");
  await http.joinGroup(ben, g.inviteCode);
  await http.joinGroup(cy, g.inviteCode);
  return { ann, ben, cy, g };
}

const entries = async (token: string, groupId: string, period: string) =>
  (await http.get(`/groups/${groupId}/leaderboard?period=${period}`, token)).body;

describe("leaderboard", () => {
  it("covers today/week/month/quarter ranges, ties and members without data", async () => {
    const { ann, ben, cy, g } = await setup();
    await http.upload(ann, [
      { date: "2026-10-14", steps: 5000 },
      { date: "2026-10-12", steps: 3000 },
      { date: "2026-10-05", steps: 7000 }
    ]);
    await http.upload(ben, [
      { date: "2026-10-14", steps: 5000 },
      { date: "2026-08-01", steps: 4000 },
      { date: "2026-07-16", steps: 999 } // outside the 90-day window (07-17..10-14)
    ]);

    const today = await entries(ann.token, g.id, "today");
    expect(today).toMatchObject({ groupId: g.id, period: "today", from: "2026-10-14", to: "2026-10-14", timezone: "UTC" });
    expect(today.entries.map((e: { displayName: string; rank: number; steps: number }) => [e.displayName, e.rank, e.steps])).toEqual([
      ["Ann", 1, 5000],
      ["Ben", 1, 5000],
      ["Cy", 3, 0]
    ]);
    expect(today.entries[2]).toMatchObject({ daysWithData: 0, dailyAverage: 0 });

    const week = await entries(ben.token, g.id, "week");
    expect([week.from, week.to]).toEqual(["2026-10-12", "2026-10-14"]);
    expect(week.entries[0]).toMatchObject({ displayName: "Ann", rank: 1, steps: 8000, dailyAverage: 2667, daysWithData: 2 });
    expect(week.entries[1]).toMatchObject({ displayName: "Ben", rank: 2, steps: 5000, dailyAverage: 1667, daysWithData: 1 });

    const month = await entries(cy.token, g.id, "month");
    expect([month.from, month.to]).toEqual(["2026-10-01", "2026-10-14"]);
    expect(month.entries[0]).toMatchObject({ displayName: "Ann", steps: 15000, dailyAverage: 1071 });
    expect(month.entries[1]).toMatchObject({ displayName: "Ben", steps: 5000 });

    const quarter = await entries(ann.token, g.id, "quarter");
    expect([quarter.from, quarter.to]).toEqual(["2026-07-17", "2026-10-14"]);
    const q = Object.fromEntries(quarter.entries.map((e: { displayName: string; steps: number }) => [e.displayName, e.steps]));
    expect(q).toEqual({ Ann: 15000, Ben: 9000, Cy: 0 });
    expect(quarter.entries[0].dailyAverage).toBe(Math.round(15000 / 90));
  });

  it("uses the group timezone for today, and defaults the period to week", async () => {
    const ann = await http.register("Ann", "Pacific/Auckland");
    const g = await http.createGroup(ann, "Kiwis"); // tz Pacific/Auckland: 2026-10-15 01:00 local (UTC+13)
    const res = await http.get(`/groups/${g.id}/leaderboard?period=today`, ann.token);
    expect([res.body.from, res.body.to]).toEqual(["2026-10-15", "2026-10-15"]);
    const dflt = await http.get(`/groups/${g.id}/leaderboard`, ann.token);
    expect(dflt.body.period).toBe("week");
    expect(dflt.body.from).toBe("2026-10-12");
    expect((await http.get(`/groups/${g.id}/leaderboard?period=year`, ann.token)).status).toBe(400);
  });

  it("group detail and friends use each timezone's today", async () => {
    const { ann, ben, g } = await setup();
    await http.upload(ben, [{ date: "2026-10-14", steps: 1234 }]);
    const detail = await http.get(`/groups/${g.id}`, ann.token);
    const benRow = detail.body.members.find((m: { userId: string }) => m.userId === ben.id);
    expect(benRow.todaySteps).toBe(1234);
    expect(detail.body.members.find((m: { userId: string }) => m.userId === ann.id).todaySteps).toBe(0);
  });
});

describe("history grid", () => {
  it("returns dates oldest first with null for missing values and settled flags", async () => {
    const { ann, ben, g } = await setup();
    await http.upload(ann, [
      { date: "2026-10-12", steps: 100 },
      { date: "2026-10-14", steps: 300 }
    ]);
    await http.upload(ben, [{ date: "2026-10-13", steps: 200 }]);
    const res = await http.get(`/groups/${g.id}/history?days=3`, ann.token);
    expect(res.status).toBe(200);
    expect(res.body.dates).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    const byName = (name: string) => res.body.members.find((m: { displayName: string }) => m.displayName === name);
    expect(byName("Ann").steps).toEqual([100, null, 300]);
    expect(byName("Ben").steps).toEqual([null, 200, null]);
    expect(byName("Cy").steps).toEqual([null, null, null]);
    expect(byName("Ann").settled).toEqual([true, true, false]);
    expect(res.body.members).toHaveLength(3);
  });

  it("defaults to 7 days and validates the range", async () => {
    const { ann, g } = await setup();
    expect((await http.get(`/groups/${g.id}/history`, ann.token)).body.dates).toHaveLength(7);
    expect((await http.get(`/groups/${g.id}/history?days=90`, ann.token)).body.dates).toHaveLength(90);
    expect((await http.get(`/groups/${g.id}/history?days=0`, ann.token)).status).toBe(400);
    expect((await http.get(`/groups/${g.id}/history?days=91`, ann.token)).status).toBe(400);
  });
});

export type { Session };
