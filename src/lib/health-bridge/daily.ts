export type HealthDailyRow = Record<string, unknown> & { date: unknown };

export type HealthDailyMetric = {
  column: string;
  canonicalName: string;
  value: number;
  unit: string;
  aggregation: "daily_sum" | "daily_avg";
};

type MetricDefinition = Omit<HealthDailyMetric, "value"> & {
  positiveOnly?: boolean;
  percentFraction?: boolean;
};

export const HEALTH_DAILY_METRICS: MetricDefinition[] = [
  { column: "sleep_total", canonicalName: "Sleep Duration", unit: "hours", aggregation: "daily_sum" },
  { column: "sleep_rem", canonicalName: "Sleep REM Duration", unit: "hours", aggregation: "daily_sum" },
  { column: "sleep_deep", canonicalName: "Sleep Deep Duration", unit: "hours", aggregation: "daily_sum" },
  { column: "sleep_core", canonicalName: "Sleep Core Duration", unit: "hours", aggregation: "daily_sum" },
  { column: "sleep_awake", canonicalName: "Sleep Awake Duration", unit: "hours", aggregation: "daily_sum" },
  { column: "sleep_in_bed", canonicalName: "Sleep In Bed Duration", unit: "hours", aggregation: "daily_sum" },
  { column: "resting_hr", canonicalName: "Resting Heart Rate", unit: "bpm", aggregation: "daily_avg", positiveOnly: true },
  { column: "hrv_sdnn", canonicalName: "HRV", unit: "ms", aggregation: "daily_avg", positiveOnly: true },
  { column: "walking_hr", canonicalName: "Walking Heart Rate Average", unit: "bpm", aggregation: "daily_avg", positiveOnly: true },
  { column: "vo2_max", canonicalName: "VO2 Max", unit: "mL/kg/min", aggregation: "daily_avg", positiveOnly: true },
  { column: "steps", canonicalName: "Steps", unit: "steps", aggregation: "daily_sum" },
  { column: "active_energy", canonicalName: "Active Energy Burned", unit: "kcal", aggregation: "daily_sum" },
  { column: "basal_energy", canonicalName: "Basal Energy Burned", unit: "kcal", aggregation: "daily_sum" },
  { column: "exercise_min", canonicalName: "Exercise Time", unit: "min", aggregation: "daily_sum" },
  { column: "stand_hours", canonicalName: "Stand Hours", unit: "count", aggregation: "daily_sum" },
  { column: "distance_km", canonicalName: "Walking/Running Distance", unit: "km", aggregation: "daily_sum" },
  { column: "flights_climbed", canonicalName: "Flights Climbed", unit: "count", aggregation: "daily_sum" },
  { column: "weight_kg", canonicalName: "Weight", unit: "kg", aggregation: "daily_avg", positiveOnly: true },
  { column: "body_fat_pct", canonicalName: "Body Fat Percentage", unit: "%", aggregation: "daily_avg", positiveOnly: true, percentFraction: true },
  { column: "respiratory_rate", canonicalName: "Respiratory Rate", unit: "breaths/min", aggregation: "daily_avg", positiveOnly: true },
  { column: "spo2", canonicalName: "Oxygen Saturation", unit: "%", aggregation: "daily_avg", positiveOnly: true, percentFraction: true },
  { column: "walking_speed", canonicalName: "Walking Speed", unit: "km/hr", aggregation: "daily_avg", positiveOnly: true },
  { column: "walking_steadiness", canonicalName: "Walking Steadiness", unit: "%", aggregation: "daily_avg", positiveOnly: true, percentFraction: true },
  { column: "workout_minutes", canonicalName: "Workout Duration", unit: "min", aggregation: "daily_sum" },
];

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function healthDailyMetrics(row: HealthDailyRow): HealthDailyMetric[] {
  return HEALTH_DAILY_METRICS.flatMap((definition) => {
    let value = finiteNumber(row[definition.column]);
    if (value === null || (definition.positiveOnly && value <= 0) || value < 0) return [];
    if (definition.percentFraction && value > 0 && value <= 1) value *= 100;
    return [{ ...definition, value }];
  });
}

export function healthDailyDate(row: HealthDailyRow): string | null {
  const value = row.date;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
