import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { StepSource } from "@steppy/core";
import { useSession } from "../api/session";
import { errorText } from "../lib/hooks";
import { sourceLabel } from "../lib/format";
import { markOnboarded } from "../state/prefs";
import { availableSources, connectSource, useSyncState } from "../sync";
import { spacing, useTheme } from "../theme";
import { AppText, Button, Card, InlineError } from "../components/ui";

function connectLabel(source: StepSource): string {
  return source === "DEMO" ? "Use demo steps" : `Connect ${sourceLabel(source)}`;
}

export function OnboardingScreen() {
  const { colors } = useTheme();
  const userId = useSession((s) => s.user?.id ?? null);
  const sync = useSyncState();
  const sources = availableSources();
  const [busy, setBusy] = useState<StepSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (userId) await markOnboarded(userId);
  };

  const connect = async (source: StepSource) => {
    setError(null);
    setBusy(source);
    try {
      await connectSource(source);
      await finish();
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };

  const real = sources.filter((s) => s !== "DEMO");
  const demo = sources.includes("DEMO");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, flexGrow: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: spacing.xs }}>
          <Text style={{ fontSize: 56 }}>📲</Text>
          <AppText variant="title" style={{ textAlign: "center" }}>
            Where do your steps come from?
          </AppText>
        </View>

        <Card style={{ gap: spacing.sm }}>
          <AppText>
            Steppy reads your daily step totals from your phone's health app and shares only those totals with your friends.
            Nothing else leaves your phone.
          </AppText>
          <AppText muted>
            When you connect, the last 90 days are imported so your weekly, monthly and 3-month leaderboards are filled in right away.
          </AppText>
        </Card>

        {busy ? (
          <Card style={{ gap: spacing.sm, alignItems: "center" }}>
            <AppText variant="bodyStrong">
              {busy === "DEMO" ? "Generating demo steps…" : `Importing the last 90 days from ${sourceLabel(busy)}…`}
            </AppText>
            <AppText variant="caption" muted>
              {sync.status === "syncing" ? "Uploading your totals" : "This can take a moment. Approve the permission prompt if you see one."}
            </AppText>
          </Card>
        ) : null}

        <InlineError message={error} />

        <View style={{ gap: spacing.sm }}>
          {real.map((source) => (
            <Button key={source} title={connectLabel(source)} onPress={() => void connect(source)} loading={busy === source} disabled={busy !== null} />
          ))}
          {demo ? (
            <Button
              title={connectLabel("DEMO")}
              variant={real.length > 0 ? "secondary" : "primary"}
              onPress={() => void connect("DEMO")}
              loading={busy === "DEMO"}
              disabled={busy !== null}
            />
          ) : null}
          <Button title="Skip for now" variant="ghost" onPress={() => void finish()} disabled={busy !== null} />
        </View>
        <AppText variant="caption" muted style={{ textAlign: "center" }}>
          You can connect or change your source any time in the Me tab.
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}
