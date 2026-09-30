import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { useNavigation, type RouteProp, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { localDateInZone, type GroupDetail, type LeaderboardPeriod } from "@steppy/core";
import {
  useAddGroupMember,
  useChallenges,
  useFriends,
  useGroup,
  useHistory,
  useLeaderboard,
  useLeaveGroup,
  useRotateInviteCode
} from "../api/hooks";
import { useSession } from "../api/session";
import { errorText, useNow, usePullRefresh } from "../lib/hooks";
import { formatSteps, plural, sourceLabel } from "../lib/format";
import { inviteShareMessage } from "../lib/links";
import { LIVE_FOOTER, PERIODS, freshness } from "../lib/leaderboard";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme";
import { ChallengeCard } from "../components/ChallengeCard";
import { CodeCard } from "../components/CodeCard";
import { DailyGrid, type DailyRow } from "../components/DailyGrid";
import { LeaderboardList } from "../components/Leaderboard";
import { QueryGate, Screen } from "../components/Screen";
import { AppText, Avatar, Badge, Button, Card, InlineError, Segmented, SectionHeader, Separator } from "../components/ui";

type View_ = "board" | "daily";

export function GroupScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "Group">>();
  const groupId = params.groupId;
  const group = useGroup(groupId);
  const [view, setView] = useState<View_>("board");
  const [period, setPeriod] = useState<LeaderboardPeriod>("today");
  const board = useLeaderboard(groupId, period);
  const history = useHistory(groupId, 7, view === "daily");
  const challenges = useChallenges(groupId);

  const { refreshing, onRefresh } = usePullRefresh(async () => {
    await Promise.all([group.refetch(), view === "board" ? board.refetch() : history.refetch(), challenges.refetch()]);
  });

  return (
    <Screen refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <QueryGate query={group}>
        {(detail) => (
          <GroupBody
            group={detail}
            view={view}
            setView={setView}
            period={period}
            setPeriod={setPeriod}
            board={board}
            history={history}
            challenges={challenges}
          />
        )}
      </QueryGate>
    </Screen>
  );
}

function GroupBody(props: {
  group: GroupDetail;
  view: View_;
  setView: (v: View_) => void;
  period: LeaderboardPeriod;
  setPeriod: (p: LeaderboardPeriod) => void;
  board: ReturnType<typeof useLeaderboard>;
  history: ReturnType<typeof useHistory>;
  challenges: ReturnType<typeof useChallenges>;
}) {
  const { group, view, period } = props;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const myId = useSession((s) => s.user?.id ?? null);
  const now = useNow();
  const today = localDateInZone(now, group.timezone);
  const names = useMemo(() => new Map(group.members.map((m) => [m.userId, m.displayName])), [group.members]);

  const dailyRows: DailyRow[] = (props.history.data?.members ?? []).map((m) => ({
    id: m.userId,
    name: m.displayName,
    isMe: m.userId === myId,
    steps: m.steps,
    settled: m.settled
  }));

  return (
    <View>
      <AppText variant="title" numberOfLines={2}>
        {group.name}
      </AppText>
      <AppText muted style={{ marginBottom: spacing.lg }}>
        {plural(group.memberCount, "member")}
      </AppText>

      <Segmented
        options={[
          { value: "board" as const, label: "Leaderboard" },
          { value: "daily" as const, label: "Daily" }
        ]}
        value={view}
        onChange={props.setView}
      />

      {view === "board" ? (
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          <Segmented options={PERIODS} value={period} onChange={props.setPeriod} />
          <QueryGate query={props.board}>
            {(lb) => (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="caption" muted>
                  {lb.from === lb.to ? lb.from : `${lb.from} to ${lb.to}`} · {lb.timezone}
                </AppText>
                <LeaderboardList entries={lb.entries} myUserId={myId} period={period} now={now} />
              </View>
            )}
          </QueryGate>
        </View>
      ) : (
        <View style={{ marginTop: spacing.md }}>
          <QueryGate query={props.history}>
            {(h) => <DailyGrid dates={h.dates} rows={dailyRows} today={today} />}
          </QueryGate>
        </View>
      )}

      <SectionHeader title="Challenges" action={{ label: "+ New", onPress: () => navigation.navigate("CreateChallenge", { groupId: group.id }) }} />
      <QueryGate query={props.challenges}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <AppText muted>No challenges yet. Start a weekly or monthly step race.</AppText>
            </Card>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {list.map((c) => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  today={today}
                  leaderNames={c.leaderIds.map((id) => names.get(id) ?? "Someone")}
                  onPress={() => navigation.navigate("Challenge", { challengeId: c.id, name: c.name })}
                />
              ))}
            </View>
          )
        }
      </QueryGate>

      <MembersSection group={group} myId={myId} now={now} />

      <AppText variant="caption" muted style={{ textAlign: "center", marginTop: spacing.xl }}>
        {LIVE_FOOTER}
      </AppText>
    </View>
  );
}

function MembersSection(props: { group: GroupDetail; myId: string | null; now: Date }) {
  const { group, myId, now } = props;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const friends = useFriends();
  const addMember = useAddGroupMember(group.id);
  const leave = useLeaveGroup(group.id);
  const rotate = useRotateInviteCode(group.id);
  const isOwner = group.ownerId === myId;

  const memberIds = new Set(group.members.map((m) => m.userId));
  const candidates = (friends.data ?? []).filter((f) => !memberIds.has(f.userId));

  const confirmLeave = () =>
    Alert.alert("Leave group?", `You'll leave "${group.name}" and any of its challenges that are not finished.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            await leave.mutateAsync();
            navigation.goBack();
          } catch (e) {
            setError(errorText(e));
          }
        }
      }
    ]);

  const confirmRotate = () =>
    Alert.alert("Get a new invite code?", "The old code and link stop working.", [
      { text: "Cancel", style: "cancel" },
      { text: "New code", onPress: () => rotate.mutate(undefined, { onError: (e) => setError(errorText(e)) }) }
    ]);

  return (
    <View>
      <SectionHeader title="Members" />
      <CodeCard
        label="Invite code"
        code={group.inviteCode}
        shareMessage={inviteShareMessage(group.name, group.inviteCode)}
        shareTitle={`Join ${group.name} on Steppy`}
        footer="Friends can tap the invite link or enter this code"
      />
      {isOwner ? (
        <Button title="Get a new invite code" variant="ghost" small onPress={confirmRotate} loading={rotate.isPending} style={{ alignSelf: "center" }} />
      ) : null}

      <Card padded={false} style={{ marginTop: spacing.md }}>
        {group.members.map((m, i) => {
          const fresh = freshness(m.lastSyncedAt, now);
          return (
            <View key={m.userId}>
              {i > 0 ? <Separator /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 60, opacity: fresh.stale ? 0.65 : 1 }}>
                <Avatar name={m.displayName} highlight={m.userId === myId} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <AppText variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {m.displayName}
                      {m.userId === myId ? " (you)" : ""}
                    </AppText>
                    {m.role === "OWNER" ? <Badge label="Owner" tone="info" /> : null}
                  </View>
                  <AppText variant="caption" muted numberOfLines={1}>
                    {sourceLabel(m.stepSource)} · {fresh.text}
                  </AppText>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <AppText variant="stepsSmall">{formatSteps(m.todaySteps)}</AppText>
                  <AppText variant="caption" muted>
                    today
                  </AppText>
                </View>
              </View>
            </View>
          );
        })}
      </Card>

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Button title={adding ? "Hide friends" : "Add a friend to this group"} variant="secondary" onPress={() => {
            // A friend may have added you since the list was loaded (no realtime event for that).
            if (!adding) void friends.refetch();
            setAdding((v) => !v);
          }} />
        {adding ? (
          candidates.length === 0 ? (
            <Card>
              <AppText muted>
                {friends.isPending ? "Loading friends…" : "All your friends are already here. Add more friends from the Friends tab."}
              </AppText>
            </Card>
          ) : (
            <Card padded={false}>
              {candidates.map((f, i) => (
                <View key={f.userId}>
                  {i > 0 ? <Separator /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md }}>
                    <Avatar name={f.displayName} />
                    <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                      {f.displayName}
                    </AppText>
                    <Button
                      title="Add"
                      small
                      loading={addMember.isPending && addMember.variables === f.userId}
                      disabled={addMember.isPending}
                      onPress={() => addMember.mutate(f.userId, { onError: (e) => setError(errorText(e)) })}
                    />
                  </View>
                </View>
              ))}
            </Card>
          )
        ) : null}
        <InlineError message={error} />
        <Button title="Leave group" variant="danger" onPress={confirmLeave} loading={leave.isPending} style={{ marginTop: spacing.md }} />
      </View>
    </View>
  );
}
