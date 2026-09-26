import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomeScreen, HistoryScreen, ChallengesScreen, FriendsScreen, ProfileScreen } from "./src/screens";
import { AuthScreen } from "./src/auth-screen";
import { useSession } from "./src/store";
import { ImportOnboardingScreen } from "./src/onboarding";
const Tabs = createBottomTabNavigator(); const queryClient = new QueryClient();
export default function App() { const userId = useSession(state => state.userId); const onboardingComplete = useSession(state => state.onboardingComplete); return <QueryClientProvider client={queryClient}>{!userId ? <AuthScreen /> : !onboardingComplete ? <ImportOnboardingScreen /> : <NavigationContainer><Tabs.Navigator screenOptions={{ headerShown: false }}><Tabs.Screen name="Home" component={HomeScreen} /><Tabs.Screen name="History" component={HistoryScreen} /><Tabs.Screen name="Challenges" component={ChallengesScreen} /><Tabs.Screen name="Friends" component={FriendsScreen} /><Tabs.Screen name="Profile" component={ProfileScreen} /></Tabs.Navigator></NavigationContainer>}</QueryClientProvider>; }
