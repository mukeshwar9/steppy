import { Alert, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { isDaySettled, localDateInZone, type ChallengeDetail } from "@steppy/core";
import { useChallenge, useJoinLeaveChallenge } from "../api/hooks";
import { useSession } from "../api/session";
import { canJoinOrLeave, daysLeftText, statusLabel, statusTone } from "../lib/challenge";
import { formatSteps, formatWindow, plural } from "../lib/format";
import { errorText, useNow, usePullRefresh } from "../lib/hooks";
import { freshness } from "../lib/leaderboard";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme";
import { DailyGrid, type DailyRow } from "../components/DailyGrid";
import { QueryGate, Screen } from "../components/Screen";
import { AppText, Avatar, Badge, Button, Card, RankBadge, SectionHeader, Separator } from "../components/ui";

export function ChallengeScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "Challenge">>();
  const query = useChallenge(params.challengeId);
  const { refreshing, onRefresh } = usePullRefresh(query.refetch);
  return (
    <Screen refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <QueryGate query={query}>{(c) => <Body challenge={c} />}</QueryGate>
    </Screen>
  );
}

function Body({ challenge: c }: { challenge: ChallengeDetail }) {
  const myId = useSession((s) => s.user?.id ?? null);
  const now = useNow();
  const today = localDateInZone(now, c.timezone);
  const joinLeave = useJoinLeaveChallenge(c.id, c.groupId);
  const joined = c.standings.some((s) => s.userId === myId);
  const winners = c.standings.filter((s) => c.winnerIds.includes(s.userId));
  const countdown = daysLeftText(c, today);

  const run = (action: "join" | "leave") =>
    joinLeave.mutate(action, { onError: (e) => Alert.alert(action === "join" ? "Couldn't join" : "Couldn't leave", errorText(e)) });

  const confirmLeave = () =>
    Alert.alert("Leave challenge?", "You'll be removed from the standings.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => run("leave") }
    ]);

  const names = new Map(c.standings.map((s) => [s.userId, s.displayName]));
  const rows: DailyRow[] = c.daily.map((d) => ({
    id: d.userId,
    name: names.get(d.userId) ?? "Player",
    isMe: d.userId === myId,
    steps: d.steps,
    settled: c.days.map((date) => isDaySettled(date, c.timezone, now))
  }));

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title">{c.name}</AppText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
          <Badge label={statusLabel(c.status)} tone={statusTone(c.status)} />
          <AppText muted>
            {c.kind === "WEEKLY" ? "Weekly" : "Monthly"} · {formatWindow(c.startDate, c.endDate)}
          </AppText>
        </View>
        <AppText variant="caption" muted>
          {[plural(c.participantCount, "player"), countdown, c.timezone].filter(Boolean).join(" · ")}
        </AppText>
      </View>

      {c.status === "FINISHED" && winners.length > 0 ? (
        <Card highlight style={{ alignItems: "center", gap: spacing.xs }}>
          <AppText style={{ fontSize: 40 }}>🏆</AppText>
          <AppText variant="heading" style={{ textAlign: "center" }}>
            {winners.length > 1 ? "It's a tie!" : `${winners[0]?.displayName} wins!`}
          </AppText>
          <AppText muted style={{ textAlign: "center" }}>
            {winners.length > 1 ? `${winners.map((w) => w.displayName).join(" & ")} · ` : ""}
            {formatSteps(winners[0]?.steps ?? 0)} steps
          </AppText>
        </Card>
      ) : null}
      {c.status === "FINISHED" && winners.length === 0 ? (
        <Card>
          <AppText muted>Finished with no steps recorded, so there's no winner.</AppText>
        </Card>
      ) : null}
      {c.status === "SETTLING" ? (
        <Card>
          <AppText muted>The last day is still settling. Final standings lock at 10:00 the next day.</AppText>
        </Card>
      ) : null}

      <SectionHeader title="Standings" />
      {c.standings.length === 0 ? (
        <Card>
          <AppText muted>Nobody has joined yet.</AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {c.standings.map((s, i) => {
            const fresh = freshness(s.lastSyncedAt, now);
            const isMe = s.userId === myId;
            return (
              <View key={s.userId}>
                {i > 0 ? <Separator /> : null}
                <View
                  accessible
                  accessibilityLabel={`Rank ${s.rank}, ${s.displayName}${isMe ? " (you)" : ""}, ${formatSteps(s.steps)} steps, ${fresh.text}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    padding: spacing.md,
                    minHeight: 64,
                    opacity: fresh.stale && c.status !== "FINISHED" ? 0.65 : 1,
                    borderRadius: 14,
                    backgroundColor: isMe ? "rgba(14,159,110,0.10)" : "transparent"
                  }}
                >
                  <RankBadge rank={s.rank} />
                  <Avatar name={s.displayName} highlight={isMe} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {s.displayName}
                      {isMe ? " (you)" : ""}
                      {c.winnerIds.includes(s.userId) ? " 🏆" : ""}
                    </AppText>
                    {c.status !== "FINISHED" ? (
                      <AppText variant="caption" muted>
                        {fresh.text}
                      </AppText>
                    ) : null}
                  </View>
                  <AppText variant="steps">{formatSteps(s.steps)}</AppText>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {canJoinOrLeave(c.status) ? (
        joined ? (
          <Button title="Leave challenge" variant="danger" onPress={confirmLeave} loading={joinLeave.isPending} />
        ) : (
          <Button title="Join challenge" onPress={() => run("join")} loading={joinLeave.isPending} />
        )
      ) : null}

      {c.days.length > 0 ? (
        <>
          <SectionHeader title="Day by day" />
          <DailyGrid dates={c.days} rows={rows} today={today} />
        </>
      ) : (
        <AppText muted>Day-by-day steps appear once the challenge starts.</AppText>
      )}
    </View>
  );
}
