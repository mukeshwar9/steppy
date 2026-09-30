import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { queryClient } from "./src/api/queryClient";
import { hydrateSession, useSession } from "./src/api/session";
import { navigationRef } from "./src/navigation/ref";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { SignedInEffects } from "./src/navigation/SignedInEffects";
import { useDeepLinkListener } from "./src/navigation/useDeepLinks";
import { hydratePrefs, usePrefs } from "./src/state/prefs";
import { useTheme } from "./src/theme";

function Root() {
  const { colors, dark } = useTheme();
  const sessionReady = useSession((s) => s.hydrated);
  const prefsReady = usePrefs((s) => s.hydrated);
  const signedIn = useSession((s) => s.accessToken !== null);
  const [navReady, setNavReady] = useState(false);
  useDeepLinkListener();

  useEffect(() => {
    void hydrateSession();
    void hydratePrefs();
  }, []);

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme: NavTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border
    }
  };

  if (!sessionReady || !prefsReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={() => setNavReady(true)}>
      <RootNavigator />
      {signedIn ? <SignedInEffects navReady={navReady} /> : null}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Root />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
