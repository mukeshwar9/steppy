import { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { challengeWindow, localDateInZone, type ChallengeKind, type GroupDetail } from "@steppy/core";
import { useCreateChallenge, useGroup } from "../api/hooks";
import { useSession } from "../api/session";
import { quickPicks } from "../lib/challenge";
import { formatWindow } from "../lib/format";
import { errorText } from "../lib/hooks";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme";
import { QueryGate, Screen } from "../components/Screen";
import { AppText, Button, Card, Chip, InlineError, SectionHeader, Segmented, TextField } from "../components/ui";

export function CreateChallengeScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "CreateChallenge">>();
  const group = useGroup(params.groupId);
  return (
    <Screen>
      <QueryGate query={group}>{(g) => <Form group={g} />}</QueryGate>
    </Screen>
  );
}

function Form({ group }: { group: GroupDetail }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const myId = useSession((s) => s.user?.id ?? null);
  const create = useCreateChallenge(group.id);
  const [kind, setKind] = useState<ChallengeKind>("WEEKLY");
  const [pickKey, setPickKey] = useState("today");
  const [name, setName] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const today = localDateInZone(new Date(), group.timezone);
  const picks = quickPicks(kind, today);
  const pick = picks.find((p) => p.key === pickKey) ?? picks[0]!;
  const window = challengeWindow(kind, pick.startDate);
  const selected = group.members.filter((m) => !excluded.has(m.userId) || m.userId === myId);

  const toggle = (userId: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const submit = async () => {
    setError(null);
    try {
      const challenge = await create.mutateAsync({
        kind,
        startDate: pick.startDate,
        name: name.trim() || undefined,
        participantIds: selected.length === group.members.length ? undefined : selected.map((m) => m.userId)
      });
      navigation.replace("Challenge", { challengeId: challenge.id, name: challenge.name });
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      <AppText muted>
        Race for the most steps in {group.name}. Dates follow the group's timezone ({group.timezone}).
      </AppText>

      <Segmented
        options={[
          { value: "WEEKLY" as const, label: "Weekly (7 days)" },
          { value: "MONTHLY" as const, label: "Monthly" }
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setPickKey("today");
        }}
      />

      <SectionHeader title="Starts" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {picks.map((p) => (
          <Chip key={p.key} label={p.label} selected={p.key === pick.key} onPress={() => setPickKey(p.key)} />
        ))}
      </View>
      <Card highlight>
        <AppText variant="bodyStrong">{formatWindow(window.startDate, window.endDate)}</AppText>
        <AppText variant="caption" muted>
          {window.startDate} to {window.endDate} ({pick.hint})
        </AppText>
      </Card>

      <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder={kind === "WEEKLY" ? "Weekly showdown" : "Monthly marathon"} maxLength={60} />

      <SectionHeader title={`Participants (${selected.length}/${group.members.length})`} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {group.members.map((m) => (
          <Chip
            key={m.userId}
            label={m.userId === myId ? `${m.displayName} (you)` : m.displayName}
            selected={m.userId === myId || !excluded.has(m.userId)}
            disabled={m.userId === myId}
            onPress={() => toggle(m.userId)}
          />
        ))}
      </View>

      <InlineError message={error} />
      <Button title="Start challenge" onPress={() => void submit()} loading={create.isPending} style={{ marginTop: spacing.md }} />
    </View>
  );
}
