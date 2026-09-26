import type { DailyStepRecord, HealthProviderType } from "./provider.js";

export type SourceRecord = DailyStepRecord & { provider: HealthProviderType };
export type CanonicalActivity = DailyStepRecord & { primaryProvider: HealthProviderType; sourceMetadata: SourceRecord[] };

/**
 * MVP source-of-truth rule: one selected provider owns canonical steps.
 * Other provider records remain provenance only and never add to totals.
 */
export function selectCanonicalRecords(records: SourceRecord[], primaryProvider: HealthProviderType): CanonicalActivity[] {
  const byDate = new Map<string, SourceRecord[]>();
  for (const record of records) {
    const bucket = byDate.get(record.localDate) ?? [];
    bucket.push(record);
    byDate.set(record.localDate, bucket);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([localDate, candidates]) => {
    const selected = candidates.find(record => record.provider === primaryProvider) ?? candidates[0];
    if (!selected) throw new Error(`No source record for ${localDate}`);
    return {
      ...selected,
      primaryProvider: selected.provider,
      sourceMetadata: candidates
    };
  });
}
