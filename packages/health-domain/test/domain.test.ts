import test from "node:test";
import assert from "node:assert/strict";
import { calculateStats, rankChallengeRows, selectCanonicalRecords } from "../src/index.js";

test("primary provider prevents overlapping sources from being summed", () => {
  const rows = selectCanonicalRecords([
    { provider: "DEVELOPER", localDate: "2025-01-01", timezone: "UTC", steps: 8000 },
    { provider: "FITBIT", localDate: "2025-01-01", timezone: "UTC", steps: 9000 }
  ], "DEVELOPER");
  assert.equal(rows[0]?.steps, 8000);
  assert.equal(rows[0]?.sourceMetadata.length, 2);
});

test("stats calculate streaks and period totals from local dates", () => {
  const stats = calculateStats([
    { localDate: "2026-01-01", steps: 10000 },
    { localDate: "2026-01-02", steps: 12000 },
    { localDate: "2026-01-03", steps: 5000 },
    { localDate: "2026-01-04", steps: 20000 }
  ], new Date("2026-01-04T12:00:00Z"));
  assert.equal(stats.lifetimeSteps, 47000);
  assert.equal(stats.longest10kStreak, 2);
  assert.equal(stats.current10kStreak, 1);
  assert.equal(stats.daysOver20k, 1);
});

test("leaderboard ranks ties equally", () => {
  const rows = rankChallengeRows([{ userId: "b", steps: 100 }, { userId: "a", steps: 100 }, { userId: "c", steps: 50 }]);
  assert.deepEqual(rows.map(row => row.rank), [1, 1, 3]);
});
