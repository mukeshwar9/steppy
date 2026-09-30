import { View } from "react-native";
import type { LeaderboardEntry, LeaderboardPeriod } from "@steppy/core";
import { formatSteps, sourceLabel } from "../lib/format";
import { freshness } from "../lib/leaderboard";
import { spacing } from "../theme";
import { AppText, Avatar, Card, RankBadge, Separator } from "./ui";

export function LeaderboardList(props: {
  entries: LeaderboardEntry[];
  myUserId: string | null;
  period: LeaderboardPeriod;
  now: Date;
}) {
  return (
    <Card padded={false}>
      {props.entries.map((entry, index) => (
        <View key={entry.userId}>
          {index > 0 ? <Separator /> : null}
          <LeaderboardRow entry={entry} isMe={entry.userId === props.myUserId} period={props.period} now={props.now} />
        </View>
      ))}
    </Card>
  );
}

function LeaderboardRow(props: { entry: LeaderboardEntry; isMe: boolean; period: LeaderboardPeriod; now: Date }) {
  const { entry, isMe, period, now } = props;
  const fresh = freshness(entry.lastSyncedAt, now);
  const showAverage = period !== "today";
  return (
    <View
      accessible
      accessibilityLabel={`Rank ${entry.rank}, ${entry.displayName}${isMe ? " (you)" : ""}, ${formatSteps(entry.steps)} steps, ${fresh.text}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        minHeight: 64,
        opacity: fresh.stale ? 0.6 : 1,
        borderRadius: 14,
        backgroundColor: isMe ? "rgba(14,159,110,0.10)" : "transparent"
      }}
    >
      <RankBadge rank={entry.rank} />
      <Avatar name={entry.displayName} highlight={isMe} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {entry.displayName}
          {isMe ? "  (you)" : ""}
        </AppText>
        <AppText variant="caption" muted numberOfLines={1}>
          {sourceLabel(entry.stepSource)} · {fresh.text}
          {fresh.stale && entry.lastSyncedAt !== null ? " ⚠" : ""}
        </AppText>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <AppText variant="steps">{formatSteps(entry.steps)}</AppText>
        {showAverage ? (
          <AppText variant="caption" muted>
            avg {formatSteps(entry.dailyAverage)}/day
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
