import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { spacing, useTheme } from "../theme";
import { ErrorState, LoadingView } from "./ui";
import { errorText } from "../lib/hooks";

/** Scrolling screen body with optional pull-to-refresh and the standard padding. */
export function Screen(props: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }, props.contentStyle]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        props.onRefresh ? <RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} /> : undefined
      }
    >
      {props.children}
    </ScrollView>
  );
}

/** Loading / error-with-retry wrapper around a react-query result. */
export function QueryGate<T>(props: {
  query: { data: T | undefined; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
}) {
  const { data, isPending, isError, error, refetch } = props.query;
  if (data !== undefined) return <>{props.children(data)}</>;
  if (isPending) return <LoadingView />;
  if (isError) return <ErrorState message={errorText(error)} onRetry={() => void refetch()} />;
  return <View />;
}
