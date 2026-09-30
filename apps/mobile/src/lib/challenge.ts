import { SETTLE_HOUR, addDays, addMonths, challengeWindow, dateRange, periodRange } from "@steppy/core";
import type { ChallengeKind, ChallengeStatus } from "@steppy/core";

export type QuickPick = { key: string; label: string; startDate: string; hint: string };

/** Start-date quick picks computed from the group's "today" (YYYY-MM-DD in the group timezone). */
export function quickPicks(kind: ChallengeKind, today: string): QuickPick[] {
  const picks: QuickPick[] = [{ key: "today", label: "Today", startDate: today, hint: "starts now" }];
  if (kind === "WEEKLY") {
    const nextMonday = addDays(periodRange("week", today).from, 7);
    picks.push({ key: "nextMonday", label: "Next Monday", startDate: nextMonday, hint: "a clean calendar week" });
  } else {
    const firstOfNextMonth = addMonths(`${today.slice(0, 7)}-01`, 1);
    picks.push({ key: "nextMonth", label: "1st of next month", startDate: firstOfNextMonth, hint: "a full calendar month" });
  }
  return picks;
}

export function windowFor(kind: ChallengeKind, startDate: string) {
  return challengeWindow(kind, startDate);
}

export function statusLabel(status: ChallengeStatus): string {
  switch (status) {
    case "UPCOMING":
      return "Upcoming";
    case "ACTIVE":
      return "Live";
    case "SETTLING":
      return `Settling until ${String(SETTLE_HOUR).padStart(2, "0")}:00`;
    case "FINISHED":
      return "Finished";
  }
}

export type Tone = "neutral" | "success" | "warning" | "info";

export function statusTone(status: ChallengeStatus): Tone {
  switch (status) {
    case "UPCOMING":
      return "info";
    case "ACTIVE":
      return "success";
    case "SETTLING":
      return "warning";
    case "FINISHED":
      return "neutral";
  }
}

/** Short countdown line: "3 days left", "Last day", "Starts in 2 days", "" once over. */
export function daysLeftText(
  challenge: { status: ChallengeStatus; startDate: string; endDate: string },
  today: string
): string {
  if (challenge.status === "UPCOMING") {
    const n = dateRange(today, challenge.startDate).length - 1;
    return n <= 1 ? "Starts tomorrow" : `Starts in ${n} days`;
  }
  if (challenge.status === "ACTIVE") {
    const n = dateRange(today, challenge.endDate).length;
    return n <= 1 ? "Last day" : `${n} days left`;
  }
  if (challenge.status === "SETTLING") return "Final numbers land soon";
  return "";
}

/** Join/leave is allowed while UPCOMING or ACTIVE. */
export function canJoinOrLeave(status: ChallengeStatus): boolean {
  return status === "UPCOMING" || status === "ACTIVE";
}
