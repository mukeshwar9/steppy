import { useEffect, useRef, useState } from "react";
import { Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { spacing } from "../theme";
import { AppText, Button, Card } from "./ui";

/** Big monospace code with Copy and Share buttons. */
export function CodeCard(props: {
  label: string;
  code: string;
  shareMessage: string;
  shareTitle?: string;
  footer?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async () => {
    await Clipboard.setStringAsync(props.code);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };
  const share = async () => {
    try {
      await Share.share({ message: props.shareMessage, title: props.shareTitle });
    } catch {
      // user dismissed or share unavailable
    }
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ alignItems: "center", gap: 2 }}>
        <AppText variant="caption" muted style={{ fontWeight: "600" }}>
          {props.label}
        </AppText>
        <AppText variant="code" accessibilityLabel={`${props.label}: ${props.code.split("").join(" ")}`}>
          {props.code}
        </AppText>
        {props.footer ? (
          <AppText variant="caption" muted style={{ textAlign: "center" }}>
            {props.footer}
          </AppText>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button title={copied ? "Copied ✓" : "Copy code"} variant="secondary" onPress={() => void copy()} style={{ flex: 1 }} small />
        <Button title="Share invite" onPress={() => void share()} style={{ flex: 1 }} small />
      </View>
    </Card>
  );
}
