import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { registerSchema } from "@steppy/shared";
import { api, saveTokens } from "./api";
import { useSession } from "./store";

WebBrowser.maybeCompleteAuthSession();
type FormValues = { email: string; password: string; displayName: string; username: string };
type Tokens = { accessToken: string; refreshToken: string; isNewUser?: boolean };
type CredentialType = "id_token" | "access_token";
const GOOGLE_SIGN_IN_ENABLED = true;
const googleConfigured = GOOGLE_SIGN_IN_ENABLED && Boolean(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID && process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID && process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);

export function AuthScreen() {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit } = useForm<FormValues>({ defaultValues: { email: "", password: "", displayName: "", username: "" } });
  const completeOnboarding = useSession(state => state.completeOnboarding);
  const beginOnboarding = useSession(state => state.beginOnboarding);
  const setUserId = useSession(state => state.setUserId);

  const finishAuth = async (tokens: Tokens, importHistory: boolean) => {
    await saveTokens(tokens.accessToken, tokens.refreshToken);
    const user = await api<{ id: string }>("/me"); setUserId(user.id);
    if (importHistory) { beginOnboarding(); return; }
    completeOnboarding();
  };
  const handleGoogleCredential = async (credential: string, credentialType: CredentialType) => {
    setLoading(true); setError(undefined);
    try { const tokens = await api<Tokens>("/auth/google", { method: "POST", body: JSON.stringify({ credential, credentialType }) }); await finishAuth(tokens, tokens.isNewUser === true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Google Sign In failed"); }
    finally { setLoading(false); }
  };
  const guestLogin = async () => {
    setLoading(true); setError(undefined);
    try { const tokens = await api<Tokens>("/auth/guest", { method: "POST" }); await finishAuth(tokens, true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Guest access failed"); }
    finally { setLoading(false); }
  };
  const submit = async (values: FormValues) => {
    setLoading(true); setError(undefined);
    try {
      let tokens: Tokens;
      if (mode === "register") { const parsed = registerSchema.safeParse(values); if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check account details"); tokens = await api<Tokens>("/auth/register", { method: "POST", body: JSON.stringify(parsed.data) }); }
      else tokens = await api<Tokens>("/auth/login", { method: "POST", body: JSON.stringify({ email: values.email, password: values.password }) });
      await finishAuth(tokens, mode === "register");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed"); } finally { setLoading(false); }
  };

  return <View style={styles.container}><Text style={styles.logo}>Steppy</Text><Text style={styles.subtitle}>Your history. Your people. Every device.</Text>{mode === "register" && <><Controller control={control} name="displayName" render={({ field }) => <TextInput style={styles.input} placeholder="Display name" value={field.value} onBlur={field.onBlur} onChangeText={field.onChange} />} /><Controller control={control} name="username" render={({ field }) => <TextInput style={styles.input} placeholder="Username" autoCapitalize="none" value={field.value} onBlur={field.onBlur} onChangeText={field.onChange} />} /></>}<Controller control={control} name="email" render={({ field }) => <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={field.value} onBlur={field.onBlur} onChangeText={field.onChange} />} /><Controller control={control} name="password" render={({ field }) => <TextInput style={styles.input} placeholder="Password" secureTextEntry value={field.value} onBlur={field.onBlur} onChangeText={field.onChange} />} />{error && <Text style={styles.error}>{error}</Text>}<Pressable style={styles.button} disabled={loading} onPress={handleSubmit(submit)}><Text style={styles.buttonText}>{loading ? "Loading..." : mode === "register" ? "Create account" : "Log in"}</Text></Pressable><Pressable style={styles.guestButton} disabled={loading} onPress={() => void guestLogin()}><Text style={styles.guestText}>Continue as guest</Text></Pressable>{googleConfigured && <GoogleSignInButton disabled={loading} onCredential={handleGoogleCredential} onError={setError} />}<Pressable onPress={() => setMode(mode === "register" ? "login" : "register")}><Text style={styles.switch}>{mode === "register" ? "Already have an account? Log in" : "Create a new account"}</Text></Pressable></View>;
}

function GoogleSignInButton({ disabled, onCredential, onError }: { disabled: boolean; onCredential: (credential: string, type: CredentialType) => void; onError: (message: string) => void }) {
  const [request, response, promptAsync] = Google.useAuthRequest({ androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID!, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID!, webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID! });
  useEffect(() => {
    if (response?.type === "error") { onError(response.error?.message ?? "Google Sign In failed"); return; }
    if (response?.type !== "success") return;
    const idToken = response.params?.id_token ?? response.authentication?.idToken;
    const accessToken = response.authentication?.accessToken;
    if (idToken) onCredential(idToken, "id_token"); else if (accessToken) onCredential(accessToken, "access_token"); else onError("Google did not return a usable credential");
  }, [response]);
  return <Pressable style={styles.googleButton} disabled={disabled || !request} onPress={() => void promptAsync()}><Text style={styles.googleText}>Continue with Google</Text></Pressable>;
}

const styles = StyleSheet.create({ container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F7F8FA", gap: 14 }, logo: { fontSize: 42, fontWeight: "800", color: "#6C5CE7" }, subtitle: { color: "#667085", marginBottom: 20 }, input: { backgroundColor: "white", borderRadius: 12, padding: 15, borderWidth: 1, borderColor: "#EAECF0" }, button: { backgroundColor: "#6C5CE7", padding: 16, borderRadius: 14, alignItems: "center" }, buttonText: { color: "white", fontWeight: "700" }, googleButton: { backgroundColor: "white", padding: 16, borderRadius: 14, alignItems: "center", borderWidth: 1, borderColor: "#D0D5DD" }, googleText: { color: "#101828", fontWeight: "700" }, guestButton: { padding: 14, alignItems: "center" }, guestText: { color: "#6C5CE7", fontWeight: "700" }, switch: { color: "#6C5CE7", textAlign: "center", fontWeight: "600" }, error: { color: "#D92D20" }, hint: { color: "#667085", fontSize: 12, textAlign: "center" } });
