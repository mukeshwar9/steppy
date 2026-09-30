import type { Member, StepSource, User as ApiUser } from "@steppy/core";
import type { User } from "@prisma/client";

type MemberUser = Pick<User, "id" | "displayName" | "stepSource" | "lastSyncedAt">;

export function toApiUser(u: User): ApiUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    friendCode: u.friendCode,
    timezone: u.timezone,
    stepSource: u.stepSource as StepSource | null,
    lastSyncedAt: u.lastSyncedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString()
  };
}

export function toMember(u: MemberUser): Member {
  return {
    userId: u.id,
    displayName: u.displayName,
    stepSource: u.stepSource as StepSource | null,
    lastSyncedAt: u.lastSyncedAt?.toISOString() ?? null
  };
}

export const MEMBER_SELECT = { id: true, displayName: true, stepSource: true, lastSyncedAt: true } as const;
