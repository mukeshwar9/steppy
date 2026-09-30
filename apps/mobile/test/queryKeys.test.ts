import { describe, expect, it } from "vitest";
import { keyId, keysAfterUpload, keysForRealtimeEvent, qk } from "../src/lib/queryKeys";

describe("query keys", () => {
  it("group-scoped keys share the group prefix", () => {
    const prefix = qk.group("g1");
    for (const key of [qk.leaderboard("g1", "week"), qk.history("g1", 7), qk.challenges("g1")]) {
      expect(key.slice(0, 2)).toEqual(prefix);
    }
  });

  it("steps.updated refreshes the group, challenges and friends", () => {
    const keys = keysForRealtimeEvent("steps.updated", {
      groupId: "g1",
      userId: "u1",
      dates: ["2026-10-01"],
      lastSyncedAt: "2026-10-01T10:00:00Z"
    });
    expect(keys).toContainEqual(qk.group("g1"));
    expect(keys).toContainEqual(qk.challengeRoot);
    expect(keys).toContainEqual(qk.friends);
  });

  it("group.updated refreshes the group list, the group and challenges", () => {
    const keys = keysForRealtimeEvent("group.updated", { groupId: "g2", reason: "member" });
    expect(keys).toContainEqual(qk.groups);
    expect(keys).toContainEqual(qk.group("g2"));
    expect(keys).toContainEqual(qk.challengeRoot);
  });

  it("upload invalidation covers group prefix and me", () => {
    const ids = keysAfterUpload().map(keyId);
    expect(ids).toContain(keyId(["group"]));
    expect(ids).toContain(keyId(qk.me));
  });
});
