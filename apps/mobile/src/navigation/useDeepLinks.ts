import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import { api } from "../api/client";
import { queryClient } from "../api/queryClient";
import { useSession } from "../api/session";
import { errorText } from "../lib/hooks";
import { parseDeepLink, type DeepLink } from "../lib/links";
import { qk } from "../lib/queryKeys";
import { resubscribeGroups } from "../realtime/socket";
import { setPendingLink, usePendingLink } from "../state/pendingLink";
import { usePrefs } from "../state/prefs";
import { navigationRef } from "./ref";

/** Stores incoming steppy:// links; they are applied by useApplyPendingLink once signed in. */
export function useDeepLinkListener(): void {
  useEffect(() => {
    let active = true;
    const handle = (url: string | null) => {
      const link = parseDeepLink(url);
      if (link) setPendingLink(link);
    };
    void Linking.getInitialURL().then((url) => active && handle(url));
    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
}

async function apply(link: DeepLink): Promise<void> {
  if (link.type === "friend") {
    try {
      const friend = await api.addFriend({ friendCode: link.code });
      await queryClient.invalidateQueries({ queryKey: qk.friends });
      if (navigationRef.isReady()) navigationRef.navigate("Tabs", { screen: "Friends" });
      Alert.alert("Friend added", friend?.displayName ? `You and ${friend.displayName} are now friends.` : "You're now friends.");
    } catch (e) {
      Alert.alert("Couldn't add friend", errorText(e));
    }
    return;
  }
  try {
    const group = await api.joinGroup({ inviteCode: link.code });
    queryClient.setQueryData(qk.group(group.id), group);
    await queryClient.invalidateQueries({ queryKey: qk.groups });
    resubscribeGroups();
    if (navigationRef.isReady()) navigationRef.navigate("Group", { groupId: group.id, name: group.name });
  } catch (e) {
    Alert.alert("Couldn't join group", errorText(e));
  }
}

/** Applies a pending deep link once the user is signed in and past onboarding. */
export function useApplyPendingLink(navReady: boolean): void {
  const link = usePendingLink((s) => s.link);
  const userId = useSession((s) => s.user?.id ?? null);
  const onboarded = usePrefs((s) => (userId ? s.onboarded.includes(userId) : false));
  const running = useRef(false);

  useEffect(() => {
    if (!link || !userId || !onboarded || !navReady || running.current) return;
    running.current = true;
    setPendingLink(null);
    void apply(link).finally(() => {
      running.current = false;
    });
  }, [link, userId, onboarded, navReady]);
}
