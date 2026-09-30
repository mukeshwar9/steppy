import type { NavigatorScreenParams } from "@react-navigation/native";

export type TabParamList = {
  Groups: undefined;
  Friends: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  // signed out
  Auth: undefined;
  // signed in, first run
  Onboarding: undefined;
  // signed in
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  NewGroup: undefined;
  Group: { groupId: string; name?: string };
  CreateChallenge: { groupId: string };
  Challenge: { challengeId: string; name?: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
