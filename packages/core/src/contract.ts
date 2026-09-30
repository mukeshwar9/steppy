/**
 * Steppy v1 API contract shared by the API server and the mobile app.
 *
 * Conventions:
 * - Calendar days are ISO strings `YYYY-MM-DD` ("local dates"). A user's steps for a day are
 *   keyed by the local date in the timezone the phone reported when uploading.
 * - Instants are ISO-8601 strings with a `Z` suffix.
 * - Every route except `/auth/*` and `GET /health` needs `Authorization: Bearer <accessToken>`.
 * - Errors use `{ statusCode, message, error }` (NestJS default shape).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const timezoneSchema = z.string().min(1).max(64);

/** Where a user's step totals come from. DEMO is the synthetic provider used without devices. */
export const stepSourceSchema = z.enum(["HEALTHKIT", "HEALTH_CONNECT", "DEMO"]);
export type StepSource = z.infer<typeof stepSourceSchema>;

/** Why the client is uploading; only used for logging and metrics. */
export const syncReasonSchema = z.enum(["backfill", "foreground", "live", "pull", "background"]);
export type SyncReason = z.infer<typeof syncReasonSchema>;

export type LeaderboardPeriod = "today" | "week" | "month" | "quarter";
export const leaderboardPeriodSchema = z.enum(["today", "week", "month", "quarter"]);

export type ChallengeKind = "WEEKLY" | "MONTHLY";
export const challengeKindSchema = z.enum(["WEEKLY", "MONTHLY"]);

/**
 * UPCOMING: before startDate (group timezone).
 * ACTIVE: startDate..endDate inclusive.
 * SETTLING: after endDate until the end date settles (10:00 the next day, group timezone).
 * FINISHED: settled; winnerIds are final.
 */
export type ChallengeStatus = "UPCOMING" | "ACTIVE" | "SETTLING" | "FINISHED";

// ---------------------------------------------------------------------------
// Auth and profile
// ---------------------------------------------------------------------------

export type User = {
  id: string;
  email: string;
  displayName: string;
  /** 8-character uppercase code others use to add this user as a friend. */
  friendCode: string;
  timezone: string;
  /** Source of this user's steps, null until they connect a health store or demo data. */
  stepSource: StepSource | null;
  /** Last successful step upload, null if never synced. */
  lastSyncedAt: string | null;
  createdAt: string;
};

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(128),
  displayName: z.string().trim().min(1).max(40),
  timezone: timezoneSchema.default("UTC")
});
export type RegisterRequest = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1)
});
export type LoginRequest = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshRequest = z.infer<typeof refreshSchema>;

/**
 * POST /auth/demo (only when the server runs with DEMO_MODE=true): creates a fresh user that is
 * already in the seeded demo group with synthetic friends, 90 days of history and live challenges.
 */
export const demoLoginSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  timezone: timezoneSchema.default("UTC")
});
export type DemoLoginRequest = z.input<typeof demoLoginSchema>;

/** Response of POST /auth/register, /auth/login, /auth/refresh and /auth/demo. */
export type AuthResponse = { accessToken: string; refreshToken: string; user: User };

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  timezone: timezoneSchema.optional()
});
export type UpdateMeRequest = z.infer<typeof updateMeSchema>;

// ---------------------------------------------------------------------------
// Steps ingest and personal history
// ---------------------------------------------------------------------------

export const stepDaySchema = z.object({
  date: localDateSchema,
  steps: z.number().int().min(0).max(200_000)
});
export type StepDay = z.infer<typeof stepDaySchema>;

/**
 * PUT /steps: idempotent upsert of daily totals read from the phone health store.
 * Totals come from the store's statistics/aggregate APIs, which already de-duplicate
 * Watch vs phone samples, so the server stores them as-is (never sums sources).
 * A day that has settled (see isDaySettled) and already has a value is frozen and skipped.
 */
export const uploadStepsSchema = z.object({
  source: stepSourceSchema,
  timezone: timezoneSchema,
  reason: syncReasonSchema,
  days: z.array(stepDaySchema).min(1).max(120)
});
export type UploadStepsRequest = z.infer<typeof uploadStepsSchema>;
export type UploadStepsResponse = {
  /** Dates written or updated. */
  accepted: string[];
  /** Dates skipped because they were already settled. */
  frozen: string[];
  lastSyncedAt: string;
};

/** GET /me/steps?from=YYYY-MM-DD&to=YYYY-MM-DD (max 120 days). */
export type DailySteps = { date: string; steps: number; source: StepSource; settled: boolean; updatedAt: string };

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

/** Public view of another user. */
export type Member = {
  userId: string;
  displayName: string;
  stepSource: StepSource | null;
  lastSyncedAt: string | null;
};

/** GET /friends */
export type Friend = Member & { friendCode: string; todaySteps: number; since: string };

/**
 * POST /friends { friendCode }: befriend the owner of the code immediately (mutual, no request step).
 * Share links: `steppy://friend/<friendCode>`. 404 for unknown code, 400 for own code, idempotent.
 */
export const addFriendSchema = z.object({ friendCode: z.string().trim().toUpperCase().min(4).max(16) });
export type AddFriendRequest = z.infer<typeof addFriendSchema>;
// DELETE /friends/:userId removes the friendship both ways (group memberships are unaffected).

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/** GET /groups */
export type GroupSummary = {
  id: string;
  name: string;
  /** Leaderboard and challenge calendar timezone (creator's timezone at creation). */
  timezone: string;
  memberCount: number;
  /** 8-character code for joining. Share links: `steppy://join/<inviteCode>`. */
  inviteCode: string;
  ownerId: string;
  activeChallengeCount: number;
  createdAt: string;
};

/** GET /groups/:id (members only; 404 otherwise). */
export type GroupDetail = GroupSummary & {
  members: Array<Member & { role: "OWNER" | "MEMBER"; joinedAt: string; todaySteps: number }>;
};

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  /** Defaults to the creator's profile timezone. */
  timezone: timezoneSchema.optional()
});
export type CreateGroupRequest = z.infer<typeof createGroupSchema>;
// POST /groups -> GroupDetail (creator becomes OWNER).

export const joinGroupSchema = z.object({ inviteCode: z.string().trim().toUpperCase().min(4).max(16) });
export type JoinGroupRequest = z.infer<typeof joinGroupSchema>;
// POST /groups/join -> GroupDetail (idempotent; 404 for unknown code).

/** POST /groups/:id/members: any member adds one of their friends directly. -> GroupDetail */
export const addGroupMemberSchema = z.object({ userId: z.string().min(1) });
export type AddGroupMemberRequest = z.infer<typeof addGroupMemberSchema>;

// POST /groups/:id/leave -> 204. If the owner leaves, the longest-standing member becomes owner;
// the group is deleted when the last member leaves. Leaving removes the user from challenges
// in that group that are not FINISHED.
// POST /groups/:id/invite-code/rotate (owner only) -> GroupSummary.

// ---------------------------------------------------------------------------
// Leaderboards and daily history
// ---------------------------------------------------------------------------

/**
 * GET /groups/:id/leaderboard?period=today|week|month|quarter
 * Ranges use the group timezone's "today": today; week = Monday..today (ISO week);
 * month = 1st..today; quarter = the last 90 days (today-89..today).
 * Every member appears, with 0 steps if they have no data.
 */
export type LeaderboardEntry = Member & {
  /** Competition ranking: ties share a rank, the next rank skips (1, 1, 3). */
  rank: number;
  steps: number;
  /** steps / number of days in the range that have elapsed (including today). */
  dailyAverage: number;
  /** Days in range with a recorded value. */
  daysWithData: number;
};
export type Leaderboard = {
  groupId: string;
  period: LeaderboardPeriod;
  from: string;
  to: string;
  timezone: string;
  entries: LeaderboardEntry[];
  generatedAt: string;
};

/**
 * GET /groups/:id/history?days=7 (1..90): steps per member per day, oldest date first,
 * ending at today in the group timezone. `steps[i]` is null when the member has no value.
 */
export type GroupHistory = {
  groupId: string;
  dates: string[];
  members: Array<Member & { steps: Array<number | null>; settled: boolean[] }>;
};

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

/**
 * POST /groups/:id/challenges.
 * WEEKLY: startDate..startDate+6. MONTHLY: startDate..(startDate + 1 month - 1 day).
 * startDate defaults to today (group timezone) and may not be in the past.
 * participantIds defaults to every current group member; ids must be group members.
 * The creator is always a participant.
 */
export const createChallengeSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  kind: challengeKindSchema,
  startDate: localDateSchema.optional(),
  participantIds: z.array(z.string().min(1)).max(100).optional()
});
export type CreateChallengeRequest = z.infer<typeof createChallengeSchema>;

export type ChallengeSummary = {
  id: string;
  groupId: string;
  name: string;
  kind: ChallengeKind;
  startDate: string;
  endDate: string;
  timezone: string;
  status: ChallengeStatus;
  participantCount: number;
  /** Current leader(s) while running, final winner(s) once FINISHED. Empty when nobody has steps. */
  leaderIds: string[];
  createdById: string;
  createdAt: string;
};

export type ChallengeStanding = Member & { rank: number; steps: number };

/** GET /challenges/:id (group members only). */
export type ChallengeDetail = ChallengeSummary & {
  standings: ChallengeStanding[];
  /** Final winner(s); set only when status is FINISHED. Ties produce several winners. */
  winnerIds: string[];
  /** Day-by-day steps for each participant over startDate..min(endDate, today). */
  days: string[];
  daily: Array<{ userId: string; steps: Array<number | null> }>;
};
// GET /groups/:id/challenges -> ChallengeSummary[] (newest first).
// POST /challenges/:id/join and POST /challenges/:id/leave -> ChallengeDetail
// (allowed while UPCOMING or ACTIVE; group members only).

// ---------------------------------------------------------------------------
// Realtime (Socket.IO namespace `/realtime`, handshake `auth: { token: accessToken }`)
// ---------------------------------------------------------------------------

/** On connect the server joins the socket to `group:<id>` for each of the user's groups. */
export type RealtimeEvents = {
  /** A group member uploaded steps. Clients refetch or patch leaderboards. */
  "steps.updated": { groupId: string; userId: string; dates: string[]; lastSyncedAt: string };
  /** Membership, challenge list or challenge status changed. */
  "group.updated": { groupId: string; reason: "member" | "challenge" | "settled" };
};
/** Client -> server: re-subscribe after joining or leaving a group. */
export type RealtimeClientEvents = { "groups.resubscribe": Record<string, never> };

export const SETTLE_HOUR = 10;
export const BACKFILL_DAYS = 90;
export const MAX_UPLOAD_DAYS = 120;
