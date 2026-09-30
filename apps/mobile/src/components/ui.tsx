import { useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { MIN_TOUCH, radius, spacing, useTheme, type Palette } from "../theme";
import { initials } from "../lib/format";
import type { Tone } from "../lib/challenge";

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type Variant = "title" | "heading" | "body" | "bodyStrong" | "caption" | "steps" | "stepsSmall" | "code";

const variantStyles: Record<Variant, TextStyle> = {
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.4 },
  heading: { fontSize: 18, fontWeight: "700" },
  body: { fontSize: 16 },
  bodyStrong: { fontSize: 16, fontWeight: "600" },
  caption: { fontSize: 13 },
  steps: { fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"] },
  stepsSmall: { fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  code: { fontSize: 26, fontWeight: "800", letterSpacing: 4, fontVariant: ["tabular-nums"] }
};

export function AppText(props: {
  variant?: Variant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  children: ReactNode;
  accessibilityLabel?: string;
  selectable?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Text
      selectable={props.selectable}
      numberOfLines={props.numberOfLines}
      accessibilityLabel={props.accessibilityLabel}
      style={[
        variantStyles[props.variant ?? "body"],
        { color: props.color ?? (props.muted ? colors.textSecondary : colors.text) },
        props.style
      ]}
    >
      {props.children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Card(props: { children: ReactNode; style?: StyleProp<ViewStyle>; highlight?: boolean; padded?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: props.highlight ? colors.highlight : colors.card,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          padding: props.padded === false ? 0 : spacing.lg
        },
        props.style
      ]}
    >
      {props.children}
    </View>
  );
}

export function SectionHeader(props: { title: string; action?: { label: string; onPress: () => void } }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading">{props.title}</AppText>
      {props.action ? (
        <Pressable
          onPress={props.action.onPress}
          accessibilityRole="button"
          hitSlop={8}
          style={{ minHeight: MIN_TOUCH, justifyContent: "center" }}
        >
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>{props.action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Separator() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button(props: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const variant = props.variant ?? "primary";
  const { bg, fg, border } = buttonColors(colors, variant);
  const disabled = props.disabled || props.loading;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.title}
      accessibilityState={{ disabled: !!disabled, busy: !!props.loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          minHeight: props.small ? MIN_TOUCH - 4 : 50,
          paddingHorizontal: props.small ? spacing.md : spacing.lg,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1
        },
        props.style
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: props.small ? 15 : 16, fontWeight: "700" }}>{props.title}</Text>
      )}
    </Pressable>
  );
}

function buttonColors(colors: Palette, variant: ButtonVariant) {
  switch (variant) {
    case "primary":
      return { bg: colors.primary, fg: colors.onPrimary, border: colors.primary };
    case "danger":
      return { bg: "transparent", fg: colors.danger, border: colors.danger };
    case "ghost":
      return { bg: "transparent", fg: colors.primary, border: "transparent" };
    case "secondary":
      return { bg: colors.cardAlt, fg: colors.text, border: colors.border };
  }
}

export function TextField(props: TextInputProps & { label?: string; error?: string | null }) {
  const { colors } = useTheme();
  const { label, error, style, ...rest } = props;
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <AppText variant="caption" muted style={{ fontWeight: "600" }}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label ?? props.placeholder}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.card, borderColor: error ? colors.danger : colors.border },
          style
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>(props: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.cardAlt }]} accessibilityRole="tablist">
      {props.options.map((option) => {
        const selected = option.value === props.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => props.onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: colors.card }]}
          >
            <Text
              numberOfLines={1}
              style={{ color: selected ? colors.text : colors.textSecondary, fontWeight: selected ? "700" : "500", fontSize: 14 }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip(props: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.selected, disabled: !!props.disabled }}
      style={[
        styles.chip,
        {
          backgroundColor: props.selected ? colors.primarySoft : colors.card,
          borderColor: props.selected ? colors.primary : colors.border,
          opacity: props.disabled ? 0.6 : 1
        }
      ]}
    >
      <Text style={{ color: props.selected ? colors.primary : colors.text, fontWeight: "600", fontSize: 15 }}>
        {props.selected ? "✓ " : ""}
        {props.label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Small display bits
// ---------------------------------------------------------------------------

export function Badge(props: { label: string; tone?: Tone }) {
  const { colors } = useTheme();
  const tone = props.tone ?? "neutral";
  const map: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: colors.cardAlt, fg: colors.textSecondary },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    info: { bg: colors.infoSoft, fg: colors.info }
  };
  const c = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: "700" }}>{props.label}</Text>
    </View>
  );
}

export function Avatar(props: { name: string; size?: number; highlight?: boolean }) {
  const { colors } = useTheme();
  const size = props.size ?? 40;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: props.highlight ? colors.primary : colors.cardAlt,
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <Text style={{ color: props.highlight ? colors.onPrimary : colors.textSecondary, fontWeight: "700", fontSize: size * 0.38 }}>
        {initials(props.name)}
      </Text>
    </View>
  );
}

export function RankBadge(props: { rank: number }) {
  const { colors } = useTheme();
  const medal = props.rank === 1 ? "🥇" : props.rank === 2 ? "🥈" : props.rank === 3 ? "🥉" : null;
  return (
    <View style={{ width: 32, alignItems: "center" }}>
      {medal ? (
        <Text style={{ fontSize: 22 }} accessibilityLabel={`Rank ${props.rank}`}>
          {medal}
        </Text>
      ) : (
        <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: 16 }} accessibilityLabel={`Rank ${props.rank}`}>
          {props.rank}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function LoadingView(props: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      {props.label ? (
        <AppText muted style={{ marginTop: spacing.md }}>
          {props.label}
        </AppText>
      ) : null}
    </View>
  );
}

export function ErrorState(props: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <AppText variant="heading" style={{ textAlign: "center" }}>
        Something went wrong
      </AppText>
      <AppText muted style={{ textAlign: "center", marginVertical: spacing.sm }}>
        {props.message}
      </AppText>
      {props.onRetry ? <Button title="Try again" onPress={props.onRetry} variant="secondary" small /> : null}
    </View>
  );
}

export function EmptyState(props: {
  emoji?: string;
  title: string;
  message: string;
  actions?: Array<{ label: string; onPress: () => void; variant?: ButtonVariant }>;
}) {
  return (
    <View style={styles.center}>
      {props.emoji ? <Text style={{ fontSize: 44, marginBottom: spacing.sm }}>{props.emoji}</Text> : null}
      <AppText variant="heading" style={{ textAlign: "center" }}>
        {props.title}
      </AppText>
      <AppText muted style={{ textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.lg }}>
        {props.message}
      </AppText>
      <View style={{ gap: spacing.sm, alignSelf: "stretch" }}>
        {props.actions?.map((a) => (
          <Button key={a.label} title={a.label} onPress={a.onPress} variant={a.variant ?? "primary"} />
        ))}
      </View>
    </View>
  );
}

export function InlineError(props: { message: string | null }) {
  const { colors } = useTheme();
  const style = useMemo(() => ({ backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.md }), [colors]);
  if (!props.message) return null;
  return (
    <View style={style} accessibilityRole="alert">
      <AppText variant="caption" color={colors.danger} style={{ fontWeight: "600" }}>
        {props.message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    minHeight: MIN_TOUCH - 8
  },
  button: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: 16
  },
  segmented: { flexDirection: "row", borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH - 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md - 3
  },
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center"
  },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, alignSelf: "flex-start" },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl }
});
