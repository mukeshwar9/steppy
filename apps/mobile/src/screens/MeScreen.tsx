import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import type { StepSource } from "@steppy/core";
import { formatUpdatedAgo } from "@steppy/core";
import { API_URL } from "../api/config";
import { useMe, useUpdateMe } from "../api/hooks";
import { useSession } from "../api/session";
import { formatSteps, sourceLabel } from "../lib/format";
import { errorText, useNow, usePullRefresh } from "../lib/hooks";
import { deviceTimezone } from "../lib/tz";
import { signOut } from "../state/auth";
import { availableSources, connectSource, disconnectSource, syncNow, useSyncState, writeSampleHealthData } from "../sync";
import { spacing } from "../theme";
import { Screen } from "../components/Screen";
import { AppText, Button, Card, InlineError, SectionHeader, TextField } from "../components/ui";

export function MeScreen() {
  const sessionUser = useSession((s) => s.user);
  const me = useMe();
  const user = me.data ?? sessionUser;
  const update = useUpdateMe();
  const sync = useSyncState();
  const now = useNow();
  const { refreshing, onRefresh } = usePullRefresh(me.refetch);

  const [name, setName] = useState(user?.displayName ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (user?.displayName) setName(user.displayName);
  }, [user?.displayName]);

  const tz = deviceTimezone();
  const nameChanged = !!user && name.trim() !== "" && name.trim() !== user.displayName;

  const saveName = async () => {
    setProfileError(null);
    try {
      await update.mutateAsync({ displayName: name.trim() });
    } catch (e) {
      setProfileError(errorText(e));
    }
  };

  const useDeviceTimezone = async () => {
    setProfileError(null);
    try {
      await update.mutateAsync({ timezone: tz });
    } catch (e) {
      setProfileError(errorText(e));
    }
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setSyncError(null);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setSyncError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const connected = sync.source !== null;
  const sources = availableSources();

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "Your data stays on the server. Sync stops on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() }
    ]);

  return (
    <Screen refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <SectionHeader title="Profile" />
      <Card style={{ gap: spacing.md }}>
        <TextField label="Display name" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" returnKeyType="done" onSubmitEditing={() => nameChanged && void saveName()} />
        {nameChanged ? <Button title="Save name" onPress={() => void saveName()} loading={update.isPending} small /> : null}
        <View style={{ gap: 2 }}>
          <AppText variant="caption" muted style={{ fontWeight: "600" }}>
            Email
          </AppText>
          <AppText>{user?.email ?? "–"}</AppText>
        </View>
        <View style={{ gap: 2 }}>
          <AppText variant="caption" muted style={{ fontWeight: "600" }}>
            Timezone
          </AppText>
          <AppText>{user?.timezone ?? tz}</AppText>
          {user && user.timezone !== tz ? (
            <View style={{ marginTop: spacing.xs, gap: spacing.xs }}>
              <AppText variant="caption" muted>
                This device is set to {tz}.
              </AppText>
              <Button title={`Use ${tz}`} variant="secondary" small onPress={() => void useDeviceTimezone()} loading={update.isPending} style={{ alignSelf: "flex-start" }} />
            </View>
          ) : null}
        </View>
        <InlineError message={profileError} />
      </Card>

      <SectionHeader title="Step source" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <AppText variant="caption" muted style={{ fontWeight: "600" }}>
              Source
            </AppText>
            <AppText variant="bodyStrong">{connected ? sourceLabel(sync.source) : "Not connected"}</AppText>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <AppText variant="caption" muted style={{ fontWeight: "600" }}>
              Steps today
            </AppText>
            <AppText variant="steps">{formatSteps(sync.todaySteps)}</AppText>
          </View>
        </View>
        <AppText variant="caption" muted>
          {syncStatusText(sync.status)} · Last synced{" "}
          {sync.lastSyncedAt ? formatUpdatedAgo(sync.lastSyncedAt, now) : "never"}
          {connected && !sync.backfillDone ? " · importing the last 90 days…" : ""}
        </AppText>
        <InlineError message={syncError ?? (sync.status === "error" ? sync.lastError : null)} />

        {connected ? (
          <Button title="Sync now" onPress={() => void run("sync", () => syncNow("pull"))} loading={busy === "sync" || sync.status === "syncing"} />
        ) : null}
        <Button
          title={connected ? "Change source" : "Connect a source"}
          variant={connected ? "secondary" : "primary"}
          onPress={() => setChoosing((v) => !v)}
          disabled={busy !== null}
        />
        {choosing ? (
          <View style={{ gap: spacing.sm }}>
            {sources.map((source: StepSource) => (
              <Button
                key={source}
                title={source === "DEMO" ? "Use demo steps" : `Connect ${sourceLabel(source)}`}
                variant="secondary"
                loading={busy === source}
                disabled={busy !== null}
                onPress={() =>
                  void run(source, async () => {
                    await connectSource(source);
                    setChoosing(false);
                    await me.refetch();
                  })
                }
              />
            ))}
            <AppText variant="caption" muted>
              Connecting imports the last 90 days.
            </AppText>
          </View>
        ) : null}
        {connected ? (
          <Button title="Disconnect" variant="danger" onPress={() => void run("disconnect", disconnectSource)} loading={busy === "disconnect"} disabled={busy !== null && busy !== "disconnect"} />
        ) : null}
      </Card>

      {__DEV__ ? (
        <>
          <SectionHeader title="Developer" />
          <Card style={{ gap: spacing.md }}>
            <AppText variant="caption" muted>
              The iOS Simulator has no step data. This writes 90 days of sample steps into Apple Health (or Health Connect on Android), then syncs them through the real read path. Connect your source first.
            </AppText>
            <Button
              title="Write sample health data"
              variant="secondary"
              loading={busy === "sample"}
              disabled={busy !== null && busy !== "sample"}
              onPress={() =>
                void run("sample", async () => {
                  await writeSampleHealthData();
                  await syncNow("pull");
                })
              }
            />
          </Card>
        </>
      ) : null}

      <SectionHeader title="About" />
      <Card style={{ gap: spacing.xs }}>
        <AppText variant="caption" muted style={{ fontWeight: "600" }}>
          API server
        </AppText>
        <AppText selectable>{API_URL}</AppText>
      </Card>

      <Button title="Sign out" variant="danger" onPress={confirmSignOut} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}

function syncStatusText(status: string): string {
  switch (status) {
    case "syncing":
      return "Syncing…";
    case "error":
      return "Sync problem";
    case "not-connected":
      return "Not connected";
    case "unavailable":
      return "Source unavailable";
    default:
      return "Up to date";
  }
}
