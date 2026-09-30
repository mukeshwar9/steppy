import { useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ApiError } from "../api/client";
import { useCreateGroup, useJoinGroup } from "../api/hooks";
import { errorText } from "../lib/hooks";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme";
import { Screen } from "../components/Screen";
import { AppText, Button, Card, InlineError, TextField } from "../components/ui";

export function NewGroupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const create = useCreateGroup();
  const join = useJoinGroup();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const submitCreate = async () => {
    if (!name.trim()) return setCreateError("Give your group a name.");
    setCreateError(null);
    try {
      const group = await create.mutateAsync(name.trim());
      navigation.replace("Group", { groupId: group.id, name: group.name });
    } catch (e) {
      setCreateError(errorText(e));
    }
  };

  const submitJoin = async () => {
    if (code.trim().length < 4) return setJoinError("Enter the invite code you received.");
    setJoinError(null);
    try {
      const group = await join.mutateAsync(code.trim().toUpperCase());
      navigation.replace("Group", { groupId: group.id, name: group.name });
    } catch (e) {
      setJoinError(e instanceof ApiError && e.status === 404 ? "No group found for that code." : errorText(e));
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.lg }}>
        <Card style={{ gap: spacing.md }}>
          <AppText variant="heading">Create a group</AppText>
          <AppText variant="caption" muted>
            Leaderboards and challenges use your timezone. You'll get an invite code to share.
          </AppText>
          <TextField label="Group name" value={name} onChangeText={setName} placeholder="Office walkers" maxLength={40} returnKeyType="done" onSubmitEditing={() => void submitCreate()} />
          <InlineError message={createError} />
          <Button title="Create group" onPress={() => void submitCreate()} loading={create.isPending} disabled={join.isPending} />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <AppText variant="heading">Join with a code</AppText>
          <TextField
            label="Invite code"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="ABCD1234"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={16}
            returnKeyType="go"
            onSubmitEditing={() => void submitJoin()}
          />
          <InlineError message={joinError} />
          <Button title="Join group" variant="secondary" onPress={() => void submitJoin()} loading={join.isPending} disabled={create.isPending} />
        </Card>
      </View>
    </Screen>
  );
}
