import { HEALTH_DAILY_METRICS, type HealthDailyMetric } from "./daily";

export type HealthSampleAggregateRow = {
  day: unknown;
  data_type: unknown;
  unit: unknown;
  sample_count: unknown;
  sum_value: unknown;
  avg_value: unknown;
  latest_synced_at: unknown;
  source_names: unknown;
};

export type AggregatedHealthSampleMetric = HealthDailyMetric & {
  date: string;
  sourceCount: number;
  syncedAt: string | null;
  sourceNames: string[];
};

const DEFINITIONS = new Map(HEALTH_DAILY_METRICS.map((definition) => [definition.column, definition]));

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/**
 * Convert raw Health Bridge samples that were grouped by day/type in SQL into
 * Hearth's daily metric contract. Unknown types are deliberately ignored until
 * their units and aggregation semantics have been reviewed.
 */
export function healthSampleAggregateMetric(
  row: HealthSampleAggregateRow
): AggregatedHealthSampleMetric | null {
  const date = dateOnly(row.day);
  const definition = DEFINITIONS.get(String(row.data_type ?? ""));
  if (!date || !definition) return null;

  let value = finiteNumber(
    definition.aggregation === "daily_sum" ? row.sum_value : row.avg_value
  );
  if (value === null || value < 0 || (definition.positiveOnly && value <= 0)) return null;
  if (definition.percentFraction && value > 0 && value <= 1) value *= 100;

  const sourceCount = Math.max(1, Math.trunc(finiteNumber(row.sample_count) ?? 1));
  const sourceNames = Array.isArray(row.source_names)
    ? row.source_names.filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];

  return {
    ...definition,
    date,
    value,
    sourceCount,
    syncedAt: row.latest_synced_at ? new Date(String(row.latest_synced_at)).toISOString() : null,
    sourceNames,
  };
}
