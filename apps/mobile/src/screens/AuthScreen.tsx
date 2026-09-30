import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../api/client";
import { API_URL } from "../api/config";
import { errorText } from "../lib/hooks";
import { signIn, signInDemo, signUp } from "../state/auth";
import { spacing, useTheme } from "../theme";
import { AppText, Button, InlineError, Segmented, TextField } from "../components/ui";

type Mode = "signin" | "signup";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthScreen() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"form" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (mode === "signup" && !displayName.trim()) return "Enter a display name.";
    if (!EMAIL.test(email.trim())) return "Enter a valid email address.";
    if (mode === "signup" && password.length < 6) return "Password must be at least 6 characters.";
    if (mode === "signin" && !password) return "Enter your password.";
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    setError(null);
    setBusy("form");
    try {
      if (mode === "signin") await signIn(email.trim(), password);
      else await signUp(displayName.trim(), email.trim(), password);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401 ? "Email or password is incorrect." : errorText(e)
      );
      setBusy(null);
    }
  };

  const demo = async () => {
    setError(null);
    setBusy("demo");
    try {
      await signInDemo();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "Demo mode is off on this server. Create an account instead, or start the API with DEMO_MODE=true."
          : errorText(e)
      );
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: spacing.xs, marginBottom: spacing.md }}>
            <Text style={{ fontSize: 56 }}>👟</Text>
            <AppText variant="title">Steppy</AppText>
            <AppText muted style={{ textAlign: "center" }}>
              Walk more with friends. Compare steps in groups and challenges.
            </AppText>
          </View>

          <Segmented
            options={[
              { value: "signin", label: "Sign in" },
              { value: "signup", label: "Create account" }
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
          />

          {mode === "signup" ? (
            <TextField label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Alex" autoCapitalize="words" maxLength={40} textContentType="name" />
          ) : null}
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
            secureTextEntry
            textContentType={mode === "signup" ? "newPassword" : "password"}
            onSubmitEditing={() => void submit()}
            returnKeyType="go"
          />

          <InlineError message={error} />

          <Button title={mode === "signin" ? "Sign in" : "Create account"} onPress={() => void submit()} loading={busy === "form"} disabled={busy !== null} />

          <View style={{ alignItems: "center", gap: spacing.sm }}>
            <AppText variant="caption" muted>
              or just look around
            </AppText>
            <Button title="Try the demo" variant="secondary" onPress={() => void demo()} loading={busy === "demo"} disabled={busy !== null} style={{ alignSelf: "stretch" }} />
          </View>

          <AppText variant="caption" muted style={{ textAlign: "center", marginTop: spacing.lg }}>
            Server: {API_URL}
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
