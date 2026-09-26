export type ChallengeRow = { userId: string; steps: number };
export function rankChallengeRows(rows: ChallengeRow[]): Array<ChallengeRow & { rank: number }> {
  const sorted = [...rows].sort((a, b) => b.steps - a.steps || a.userId.localeCompare(b.userId));
  return sorted.map((row, index) => {
    if (index === 0 || row.steps !== sorted[index - 1]!.steps) return { ...row, rank: index + 1 };
    let firstDifferent = index - 1;
    while (firstDifferent >= 0 && sorted[firstDifferent]!.steps === row.steps) firstDifferent--;
    return { ...row, rank: firstDifferent + 2 };
  });
}
