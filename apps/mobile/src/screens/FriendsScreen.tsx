import { useState } from "react";
import { Alert, View } from "react-native";
import { ApiError } from "../api/client";
import { useAddFriend, useFriends, useRemoveFriend } from "../api/hooks";
import { useSession } from "../api/session";
import { formatSteps, sourceLabel } from "../lib/format";
import { errorText, useNow, usePullRefresh } from "../lib/hooks";
import { freshness } from "../lib/leaderboard";
import { friendShareMessage } from "../lib/links";
import { spacing } from "../theme";
import { CodeCard } from "../components/CodeCard";
import { QueryGate, Screen } from "../components/Screen";
import { AppText, Avatar, Button, Card, InlineError, SectionHeader, Separator, TextField } from "../components/ui";

export function FriendsScreen() {
  const me = useSession((s) => s.user);
  const now = useNow();
  const friends = useFriends();
  const add = useAddFriend();
  const remove = useRemoveFriend();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { refreshing, onRefresh } = usePullRefresh(friends.refetch);

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return setError("Enter your friend's code.");
    setError(null);
    setNotice(null);
    try {
      await add.mutateAsync(trimmed);
      setCode("");
      setNotice("Friend added!");
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "No one has that code."
          : e instanceof ApiError && e.status === 400
            ? "That's your own code."
            : errorText(e)
      );
    }
  };

  const confirmRemove = (userId: string, name: string) =>
    Alert.alert(`Remove ${name}?`, "You'll stop seeing each other as friends. Shared groups are unaffected.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => remove.mutate(userId, { onError: (e) => Alert.alert("Couldn't remove friend", errorText(e)) })
      }
    ]);

  return (
    <Screen refreshing={refreshing} onRefresh={() => void onRefresh()}>
      {me ? (
        <CodeCard
          label="Your friend code"
          code={me.friendCode}
          shareMessage={friendShareMessage(me.displayName, me.friendCode)}
          shareTitle="Add me on Steppy"
          footer="Share it so friends can add you"
        />
      ) : null}

      <SectionHeader title="Add a friend" />
      <Card style={{ gap: spacing.md }}>
        <TextField
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="Friend code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <InlineError message={error} />
        {notice ? (
          <AppText variant="caption" color="#0B7A54" style={{ fontWeight: "600" }}>
            {notice}
          </AppText>
        ) : null}
        <Button title="Add friend" onPress={() => void submit()} loading={add.isPending} />
      </Card>

      <SectionHeader title="Friends" />
      <QueryGate query={friends}>
        {(list) =>
          list.length === 0 ? (
            <Card style={{ alignItems: "center", gap: spacing.xs }}>
              <AppText style={{ fontSize: 36 }}>🤝</AppText>
              <AppText variant="bodyStrong">No friends yet</AppText>
              <AppText muted style={{ textAlign: "center" }}>
                Share your friend code above, or enter theirs, to start comparing steps.
              </AppText>
            </Card>
          ) : (
            <Card padded={false}>
              {list.map((f, i) => {
                const fresh = freshness(f.lastSyncedAt, now);
                return (
                  <View key={f.userId}>
                    {i > 0 ? <Separator /> : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 64, opacity: fresh.stale ? 0.65 : 1 }}>
                      <Avatar name={f.displayName} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {f.displayName}
                        </AppText>
                        <AppText variant="caption" muted numberOfLines={1}>
                          {sourceLabel(f.stepSource)} · {fresh.text}
                        </AppText>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <AppText variant="stepsSmall">{formatSteps(f.todaySteps)}</AppText>
                        <AppText variant="caption" muted>
                          today
                        </AppText>
                      </View>
                      <Button title="Remove" variant="ghost" small accessibilityLabel={`Remove ${f.displayName}`} onPress={() => confirmRemove(f.userId, f.displayName)} />
                    </View>
                  </View>
                );
              })}
            </Card>
          )
        }
      </QueryGate>
    </Screen>
  );
}
