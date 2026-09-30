/** Typed client for every route in @steppy/core's contract. Works outside React (background tasks). */
import type {
  AddFriendRequest,
  AddGroupMemberRequest,
  AuthResponse,
  ChallengeDetail,
  ChallengeSummary,
  CreateChallengeRequest,
  CreateGroupRequest,
  DailySteps,
  DemoLoginRequest,
  Friend,
  GroupDetail,
  GroupHistory,
  GroupSummary,
  JoinGroupRequest,
  Leaderboard,
  LeaderboardPeriod,
  LoginRequest,
  RegisterRequest,
  UpdateMeRequest,
  UploadStepsRequest,
  UploadStepsResponse,
  User
} from "@steppy/core";
import { request } from "./http";

export { ApiError } from "./http";

/** `asUser` binds the upload to the user whose steps were read; it fails if another account signed in meanwhile. */
export async function uploadSteps(body: UploadStepsRequest, asUser?: string): Promise<UploadStepsResponse> {
  return request<UploadStepsResponse>("PUT", "/steps", { body, asUser });
}

const enc = encodeURIComponent;

export const api = {
  // auth
  register: (body: RegisterRequest) => request<AuthResponse>("POST", "/auth/register", { body, auth: false }),
  login: (body: LoginRequest) => request<AuthResponse>("POST", "/auth/login", { body, auth: false }),
  demoLogin: (body: DemoLoginRequest) => request<AuthResponse>("POST", "/auth/demo", { body, auth: false }),

  // profile and personal steps
  getMe: () => request<User>("GET", "/me"),
  updateMe: (body: UpdateMeRequest) => request<User>("PATCH", "/me", { body }),
  /** Deletes the account and all its data (204). */
  deleteMe: () => request<void>("DELETE", "/me"),
  getMySteps: (from: string, to: string) => request<DailySteps[]>("GET", "/me/steps", { query: { from, to } }),

  // friends
  listFriends: () => request<Friend[]>("GET", "/friends"),
  addFriend: (body: AddFriendRequest) => request<Friend>("POST", "/friends", { body }),
  removeFriend: (userId: string) => request<void>("DELETE", `/friends/${enc(userId)}`),

  // groups
  listGroups: () => request<GroupSummary[]>("GET", "/groups"),
  getGroup: (id: string) => request<GroupDetail>("GET", `/groups/${enc(id)}`),
  createGroup: (body: CreateGroupRequest) => request<GroupDetail>("POST", "/groups", { body }),
  joinGroup: (body: JoinGroupRequest) => request<GroupDetail>("POST", "/groups/join", { body }),
  addGroupMember: (groupId: string, body: AddGroupMemberRequest) =>
    request<GroupDetail>("POST", `/groups/${enc(groupId)}/members`, { body }),
  leaveGroup: (groupId: string) => request<void>("POST", `/groups/${enc(groupId)}/leave`),
  rotateInviteCode: (groupId: string) => request<GroupSummary>("POST", `/groups/${enc(groupId)}/invite-code/rotate`),
  getLeaderboard: (groupId: string, period: LeaderboardPeriod) =>
    request<Leaderboard>("GET", `/groups/${enc(groupId)}/leaderboard`, { query: { period } }),
  getHistory: (groupId: string, days: number) =>
    request<GroupHistory>("GET", `/groups/${enc(groupId)}/history`, { query: { days } }),

  // challenges
  listChallenges: (groupId: string) => request<ChallengeSummary[]>("GET", `/groups/${enc(groupId)}/challenges`),
  createChallenge: (groupId: string, body: CreateChallengeRequest) =>
    request<ChallengeDetail>("POST", `/groups/${enc(groupId)}/challenges`, { body }),
  getChallenge: (id: string) => request<ChallengeDetail>("GET", `/challenges/${enc(id)}`),
  joinChallenge: (id: string) => request<ChallengeDetail>("POST", `/challenges/${enc(id)}/join`),
  leaveChallenge: (id: string) => request<ChallengeDetail>("POST", `/challenges/${enc(id)}/leave`)
};
