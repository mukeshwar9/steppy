import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { FriendsScreen } from "../screens/FriendsScreen";
import { GroupsScreen } from "../screens/GroupsScreen";
import { MeScreen } from "../screens/MeScreen";
import { useTheme } from "../theme";
import type { TabParamList } from "./types";

const Tab = createBottomTabNavigator<TabParamList>();

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
  };

export function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" }
      }}
    >
      <Tab.Screen name="Groups" component={GroupsScreen} options={{ tabBarIcon: icon("👥") }} />
      <Tab.Screen name="Friends" component={FriendsScreen} options={{ tabBarIcon: icon("🤝") }} />
      <Tab.Screen name="Me" component={MeScreen} options={{ tabBarIcon: icon("🙂") }} />
    </Tab.Navigator>
  );
}
