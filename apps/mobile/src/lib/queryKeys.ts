import type { LeaderboardPeriod, RealtimeEvents } from "@steppy/core";

export type QueryKey = readonly unknown[];

/** All react-query keys. Group-scoped keys share the ["group", id] prefix so one invalidation covers them. */
export const qk = {
  me: ["me"] as const,
  groups: ["groups"] as const,
  group: (id: string) => ["group", id] as const,
  leaderboard: (id: string, period: LeaderboardPeriod) => ["group", id, "leaderboard", period] as const,
  history: (id: string, days: number) => ["group", id, "history", days] as const,
  challenges: (groupId: string) => ["group", groupId, "challenges"] as const,
  challenge: (id: string) => ["challenge", id] as const,
  challengeRoot: ["challenge"] as const,
  friends: ["friends"] as const
};

/** Queries to invalidate when a realtime event arrives. */
export function keysForRealtimeEvent<K extends keyof RealtimeEvents>(event: K, payload: RealtimeEvents[K]): QueryKey[] {
  const groupId = (payload as { groupId?: string }).groupId;
  if (event === "steps.updated") {
    return [...(groupId ? [qk.group(groupId)] : []), qk.challengeRoot, qk.friends];
  }
  return [qk.groups, ...(groupId ? [qk.group(groupId)] : []), qk.challengeRoot];
}

/** Queries to refresh after this device uploads steps successfully. */
export function keysAfterUpload(): QueryKey[] {
  return [qk.me, qk.groups, ["group"], qk.challengeRoot, qk.friends];
}

export function keyId(key: QueryKey): string {
  return JSON.stringify(key);
}
