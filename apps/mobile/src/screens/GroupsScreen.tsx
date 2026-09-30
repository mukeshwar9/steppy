import { Pressable, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useGroups } from "../api/hooks";
import { plural } from "../lib/format";
import { usePullRefresh } from "../lib/hooks";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme";
import { Screen, QueryGate } from "../components/Screen";
import { AppText, Badge, Button, Card, EmptyState } from "../components/ui";

export function GroupsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const query = useGroups();
  const { refreshing, onRefresh } = usePullRefresh(query.refetch);
  const openNew = () => navigation.navigate("NewGroup");

  return (
    <Screen refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <QueryGate query={query}>
        {(groups) =>
          groups.length === 0 ? (
            <EmptyState
              emoji="👥"
              title="No groups yet"
              message="Create a group and invite friends, or join one with an invite code."
              actions={[
                { label: "Create a group", onPress: openNew },
                { label: "Join with a code", onPress: openNew, variant: "secondary" }
              ]}
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.name}, ${plural(group.memberCount, "member")}`}
                  onPress={() => navigation.navigate("Group", { groupId: group.id, name: group.name })}
                >
                  {({ pressed }) => (
                    <Card style={{ opacity: pressed ? 0.8 : 1, gap: spacing.xs }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                        <AppText variant="heading" numberOfLines={1} style={{ flex: 1 }}>
                          {group.name}
                        </AppText>
                        <AppText muted>›</AppText>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
                        <AppText variant="caption" muted>
                          {plural(group.memberCount, "member")}
                        </AppText>
                        {group.activeChallengeCount > 0 ? (
                          <Badge label={`${plural(group.activeChallengeCount, "active challenge")}`} tone="success" />
                        ) : null}
                      </View>
                    </Card>
                  )}
                </Pressable>
              ))}
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                <Button title="New group" onPress={openNew} style={{ flex: 1 }} />
                <Button title="Join with code" variant="secondary" onPress={openNew} style={{ flex: 1 }} />
              </View>
            </View>
          )
        }
      </QueryGate>
    </Screen>
  );
}
