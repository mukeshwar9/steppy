import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSession } from "../api/session";
import { usePrefs } from "../state/prefs";
import { AuthScreen } from "../screens/AuthScreen";
import { ChallengeScreen } from "../screens/ChallengeScreen";
import { CreateChallengeScreen } from "../screens/CreateChallengeScreen";
import { GroupScreen } from "../screens/GroupScreen";
import { NewGroupScreen } from "../screens/NewGroupScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { useTheme } from "../theme";
import { MainTabs } from "./MainTabs";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { colors } = useTheme();
  const userId = useSession((s) => s.user?.id ?? null);
  const signedIn = useSession((s) => s.accessToken !== null) && userId !== null;
  const onboarded = usePrefs((s) => (userId ? s.onboarded.includes(userId) : false));

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      {!signedIn ? (
        <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
      ) : !onboarded ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: "New group", presentation: "modal" }} />
          <Stack.Screen name="Group" component={GroupScreen} options={({ route }) => ({ title: route.params.name ?? "Group" })} />
          <Stack.Screen name="CreateChallenge" component={CreateChallengeScreen} options={{ title: "New challenge", presentation: "modal" }} />
          <Stack.Screen name="Challenge" component={ChallengeScreen} options={({ route }) => ({ title: route.params.name ?? "Challenge" })} />
        </>
      )}
    </Stack.Navigator>
  );
}
