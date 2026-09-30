/** react-query hooks over the typed client. Query keys live in lib/queryKeys.ts. */
import { useIsFocused } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateChallengeRequest, LeaderboardPeriod, UpdateMeRequest } from "@steppy/core";
import { qk } from "../lib/queryKeys";
import { resubscribeGroups } from "../realtime/socket";
import { api } from "./client";
import { updateStoredUser } from "./session";

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      const user = await api.getMe();
      await updateStoredUser(user);
      return user;
    }
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateMeRequest) => {
      const user = await api.updateMe(body);
      await updateStoredUser(user);
      return user;
    },
    onSuccess: (user) => {
      qc.setQueryData(qk.me, user);
      void qc.invalidateQueries({ queryKey: ["group"] });
    }
  });
}

export function useGroups() {
  return useQuery({ queryKey: qk.groups, queryFn: api.listGroups });
}

export function useGroup(groupId: string) {
  return useQuery({ queryKey: qk.group(groupId), queryFn: () => api.getGroup(groupId) });
}

/** Leaderboard with a 60 s polling fallback while the screen is focused (realtime is primary). */
export function useLeaderboard(groupId: string, period: LeaderboardPeriod) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: qk.leaderboard(groupId, period),
    queryFn: () => api.getLeaderboard(groupId, period),
    refetchInterval: focused ? 60_000 : false
  });
}

export function useHistory(groupId: string, days: number, enabled = true) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: qk.history(groupId, days),
    queryFn: () => api.getHistory(groupId, days),
    enabled,
    refetchInterval: focused ? 60_000 : false
  });
}

export function useChallenges(groupId: string) {
  return useQuery({ queryKey: qk.challenges(groupId), queryFn: () => api.listChallenges(groupId) });
}

export function useChallenge(challengeId: string) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: qk.challenge(challengeId),
    queryFn: () => api.getChallenge(challengeId),
    refetchInterval: focused ? 60_000 : false
  });
}

/** Friends have no realtime event (someone adding you is silent), so poll every 60 s while focused. */
export function useFriends() {
  const focused = useIsFocused();
  return useQuery({ queryKey: qk.friends, queryFn: api.listFriends, refetchInterval: focused ? 60_000 : false });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createGroup({ name }),
    onSuccess: (group) => {
      qc.setQueryData(qk.group(group.id), group);
      void qc.invalidateQueries({ queryKey: qk.groups });
      resubscribeGroups();
    }
  });
}

export function useJoinGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => api.joinGroup({ inviteCode }),
    onSuccess: (group) => {
      qc.setQueryData(qk.group(group.id), group);
      void qc.invalidateQueries({ queryKey: qk.groups });
      void qc.invalidateQueries({ queryKey: qk.group(group.id) });
      resubscribeGroups();
    }
  });
}

export function useLeaveGroup(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.leaveGroup(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.groups });
      void qc.invalidateQueries({ queryKey: qk.challengeRoot });
      resubscribeGroups();
    }
  });
}

export function useAddGroupMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.addGroupMember(groupId, { userId }),
    onSuccess: (group) => {
      qc.setQueryData(qk.group(groupId), group);
      void qc.invalidateQueries({ queryKey: qk.groups });
      void qc.invalidateQueries({ queryKey: qk.group(groupId) });
    }
  });
}

export function useRotateInviteCode(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.rotateInviteCode(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.group(groupId) });
      void qc.invalidateQueries({ queryKey: qk.groups });
    }
  });
}

export function useCreateChallenge(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChallengeRequest) => api.createChallenge(groupId, body),
    onSuccess: (challenge) => {
      qc.setQueryData(qk.challenge(challenge.id), challenge);
      void qc.invalidateQueries({ queryKey: qk.challenges(groupId) });
      void qc.invalidateQueries({ queryKey: qk.groups });
    }
  });
}

export function useJoinLeaveChallenge(challengeId: string, groupId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: "join" | "leave") =>
      action === "join" ? api.joinChallenge(challengeId) : api.leaveChallenge(challengeId),
    onSuccess: (challenge) => {
      qc.setQueryData(qk.challenge(challengeId), challenge);
      if (groupId) void qc.invalidateQueries({ queryKey: qk.challenges(groupId) });
    }
  });
}

export function useAddFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (friendCode: string) => api.addFriend({ friendCode }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.friends });
    }
  });
}

export function useRemoveFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeFriend(userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.friends });
    }
  });
}
