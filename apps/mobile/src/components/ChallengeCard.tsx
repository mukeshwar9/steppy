import { Pressable, View } from "react-native";
import type { ChallengeSummary } from "@steppy/core";
import { daysLeftText, statusLabel, statusTone } from "../lib/challenge";
import { formatWindow, plural } from "../lib/format";
import { spacing } from "../theme";
import { AppText, Badge, Card } from "./ui";

export function ChallengeCard(props: {
  challenge: ChallengeSummary;
  leaderNames: string[];
  today: string;
  onPress: () => void;
}) {
  const c = props.challenge;
  const days = daysLeftText(c, props.today);
  const leaders =
    props.leaderNames.length === 0
      ? null
      : `${c.status === "FINISHED" ? "Winner" : "Leading"}: ${props.leaderNames.join(", ")}`;
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`${c.name}, ${statusLabel(c.status)}`}>
      {({ pressed }) => (
        <Card style={{ opacity: pressed ? 0.8 : 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
            <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {c.name}
            </AppText>
            <Badge label={statusLabel(c.status)} tone={statusTone(c.status)} />
          </View>
          <AppText variant="caption" muted style={{ marginTop: 2 }}>
            {c.kind === "WEEKLY" ? "Weekly" : "Monthly"} · {formatWindow(c.startDate, c.endDate)} · {plural(c.participantCount, "player")}
            {days ? ` · ${days}` : ""}
          </AppText>
          {leaders ? (
            <AppText variant="caption" style={{ marginTop: spacing.xs, fontWeight: "600" }}>
              {c.status === "FINISHED" ? "🏆 " : "🔥 "}
              {leaders}
            </AppText>
          ) : null}
        </Card>
      )}
    </Pressable>
  );
}
