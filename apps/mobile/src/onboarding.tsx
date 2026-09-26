import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "./api";
import { readHealthConnectHistory, type HealthConnectDailyRecord } from "./health-connect";
import { useSession } from "./store";

type Stats = { lifetimeSteps: number; bestDay: { steps: number; localDate: string } | null; current10kStreak: number };
type ImportStatus = "idle" | "working" | "done" | "error";
export function ImportOnboardingScreen() {
  const completeOnboarding = useSession(state => state.completeOnboarding);
  const [status, setStatus] = useState<ImportStatus>("idle"); const [progress, setProgress] = useState(0); const [recordsImported, setRecordsImported] = useState(0); const [error, setError] = useState<string>();
  const stats = useQuery({ queryKey: ["onboarding-stats"], queryFn: () => api<Stats>("/me/activity/stats"), enabled: status === "done" });
  const connectAndImport = async () => {
    setStatus("working"); setProgress(2); setError(undefined);
    try {
      const records = await readHealthConnectHistory(() => setProgress(25));
      await api("/health/HEALTH_CONNECT/connect", { method: "POST" });
      setProgress(30);
      const batches = chunk(records, 250);
      for (let index = 0; index < batches.length; index++) { await api("/health/HEALTH_CONNECT/records", { method: "POST", body: JSON.stringify({ records: batches[index] }) }); setRecordsImported((index + 1) * (batches[index]?.length ?? 0)); setProgress(30 + Math.round(((index + 1) / Math.max(1, batches.length)) * 70)); }
      setStatus("done");
    } catch (cause) { setStatus("error"); setError(cause instanceof Error ? cause.message : "Health Connect import failed"); }
  };
  if (status === "done") return <View style={styles.container}><Text style={styles.eyebrow}>YOUR HISTORY</Text><Text style={styles.title}>Here’s what we found</Text><Text style={styles.hero}>{((stats.data?.lifetimeSteps ?? 0) / 1000000).toFixed(1)}m</Text><Text style={styles.subtitle}>lifetime steps imported</Text><View style={styles.card}><Text style={styles.cardText}>🔥 Current streak: {stats.data?.current10kStreak ?? 0} days</Text>{stats.data?.bestDay && <Text style={styles.cardText}>Best day: {stats.data.bestDay.steps.toLocaleString()} steps</Text>}</View><Pressable style={styles.button} onPress={completeOnboarding}><Text style={styles.buttonText}>Enter Steppy</Text></Pressable></View>;
  return <View style={styles.container}><Text style={styles.eyebrow}>ANDROID HEALTH CONNECT</Text><Text style={styles.title}>{status === "idle" ? "Connect your step history" : status === "error" ? "Could not import history" : "Importing your history..."}</Text><Text style={styles.subtitle}>{status === "idle" ? "Steppy reads daily steps only. It does not write or modify your health data." : status === "error" ? error : "Your history stays on your device until you approve the import."}</Text>{status !== "idle" && <><View style={styles.progress}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View><Text style={styles.percent}>{progress}%</Text><Text style={styles.subtitle}>{recordsImported.toLocaleString()} daily records uploaded</Text></>}{(status === "idle" || status === "error") && <Pressable style={styles.button} onPress={() => void connectAndImport()}><Text style={styles.buttonText}>{status === "error" ? "Try again" : "Connect Health Connect"}</Text></Pressable>}</View>;
}
function chunk(records: HealthConnectDailyRecord[], size: number): HealthConnectDailyRecord[][] { const batches: HealthConnectDailyRecord[][] = []; for (let index = 0; index < records.length; index += size) batches.push(records.slice(index, index + size)); return batches; }
const styles = StyleSheet.create({ container: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#F7F8FA", gap: 16 }, eyebrow: { color: "#6C5CE7", fontWeight: "800", letterSpacing: 1.4 }, title: { fontSize: 32, lineHeight: 38, fontWeight: "800", color: "#101828" }, hero: { fontSize: 64, fontWeight: "800", color: "#6C5CE7" }, subtitle: { color: "#667085", fontSize: 16, lineHeight: 24 }, progress: { height: 14, borderRadius: 8, backgroundColor: "#E4E7EC", overflow: "hidden", marginTop: 12 }, progressFill: { height: "100%", backgroundColor: "#6C5CE7" }, percent: { fontSize: 28, fontWeight: "800", color: "#101828" }, card: { backgroundColor: "white", borderRadius: 18, padding: 20, gap: 12 }, cardText: { fontSize: 17, color: "#344054", fontWeight: "600" }, button: { backgroundColor: "#6C5CE7", borderRadius: 14, padding: 17, alignItems: "center", marginTop: 12 }, buttonText: { color: "white", fontWeight: "800", fontSize: 16 }, error: { color: "#D92D20" } });
