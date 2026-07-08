/**
 * Pure series logic for the health drill-down pages. No DB access here —
 * everything is unit-testable. Loaders in metric.ts/system.ts/overview.ts
 * feed these functions with query results.
 */

export type RangeKey = "3m" | "6m" | "1y" | "3y" | "all";
export type RollupPeriod = "day" | "week" | "month";
export type Interpretation = "low" | "normal" | "high" | "critical" | "unknown";

export type SeriesPoint = {
  date: string;
  value: number;
  min?: number;
  max?: number;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: Interpretation;
};

export type MetricSeries = {
  mode: "raw" | "rollup";
  period: RollupPeriod | null;
  caption: string;
  points: SeriesPoint[];
};

export type RollupBucketRow = {
  bucket: Date;
  avgValue: number | null;
  sumValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  sourceCount: number;
};

export const RANGES: RangeKey[] = ["3m", "6m", "1y", "3y", "all"];
export const RANGE_LABELS: Record<RangeKey, string> = {
  "3m": "3 months",
  "6m": "6 months",
  "1y": "1 year",
  "3y": "3 years",
  all: "All time",
};

/** Above this many raw points in range, charts read from rollups. */
export const DENSITY_THRESHOLD = 120;
/** Raw fallback cap when a dense metric has no rollups. */
export const MAX_RAW_POINTS = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTENTION_ABNORMAL_MS = 548 * DAY_MS; // ~18 months
const ATTENTION_CRITICAL_MS = 730 * DAY_MS; // ~24 months

export function parseRange(value: string | undefined): RangeKey {
  return RANGES.includes(value as RangeKey) ? (value as RangeKey) : "all";
}

export function rangeStart(range: RangeKey, now = new Date()): Date | null {
  if (range === "all") return null;
  const months = { "3m": 3, "6m": 6, "1y": 12, "3y": 36 }[range];
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
}

export function shouldUseRollups(rawCount: number): boolean {
  return rawCount > DENSITY_THRESHOLD;
}

export function rollupPeriodFor(range: RangeKey): RollupPeriod {
  if (range === "3m") return "day";
  if (range === "6m" || range === "1y") return "week";
  return "month";
}

export function attentionState(input: {
  interpretation: string;
  observedAt: Date;
  now?: Date;
}): "attention" | "historical" | "none" {
  const now = input.now ?? new Date();
  const age = now.getTime() - input.observedAt.getTime();
  if (input.interpretation === "critical") {
    return age <= ATTENTION_CRITICAL_MS ? "attention" : "historical";
  }
  if (input.interpretation === "high" || input.interpretation === "low") {
    return age <= ATTENTION_ABNORMAL_MS ? "attention" : "historical";
  }
  return "none";
}

export function trendOf(values: number[]): "rising" | "falling" | "flat" | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return null;
  const change = (last - first) / Math.abs(first);
  if (change > 0.05) return "rising";
  if (change < -0.05) return "falling";
  return "flat";
}

const PERIOD_LABELS: Record<RollupPeriod, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

export function rollupSeries(rows: RollupBucketRow[], period: RollupPeriod): MetricSeries {
  const points: SeriesPoint[] = [];
  let isSum = false;
  let sourceCount = 0;
  for (const row of rows) {
    const value = row.avgValue ?? row.sumValue;
    if (value == null) continue;
    if (row.avgValue == null) isSum = true;
    sourceCount += row.sourceCount;
    points.push({
      date: row.bucket.toISOString(),
      value,
      min: row.minValue ?? undefined,
      max: row.maxValue ?? undefined,
      referenceLow: null,
      referenceHigh: null,
      interpretation: "unknown",
    });
  }
  const caption = `${PERIOD_LABELS[period]} ${isSum ? "totals" : "averages"} from ${sourceCount.toLocaleString("en-IN")} readings`;
  return { mode: "rollup", period, caption, points };
}

export function rawSeries(
  rows: Array<{
    observedAt: Date;
    valueNumeric: number;
    referenceLow: number | null;
    referenceHigh: number | null;
    interpretation: Interpretation;
  }>
): MetricSeries {
  const points: SeriesPoint[] = rows.map((r) => ({
    date: r.observedAt.toISOString(),
    value: r.valueNumeric,
    referenceLow: r.referenceLow,
    referenceHigh: r.referenceHigh,
    interpretation: r.interpretation,
  }));
  const caption =
    points.length === 1 ? "1 recorded value" : `All ${points.length} recorded values`;
  return { mode: "raw", period: null, caption, points };
}

/** Even-step downsample that always keeps the final element. */
export function downsampleEven<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const sampled = items.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== items[items.length - 1]) {
    sampled.push(items[items.length - 1]);
  }
  return sampled;
}
