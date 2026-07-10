import { createHash } from "crypto";
import { createReadStream } from "fs";
import { readdir } from "fs/promises";
import path from "path";
import readline from "readline";
import { config } from "dotenv";
import { Pool } from "pg";
import {
  isImplausibleMetricObservation,
  normalizeMetricRecord,
} from "../src/lib/health/normalization";

config({ path: ".env.local" });
config({ path: ".env" });

type RollupAggregation = "daily_sum" | "daily_avg" | "min" | "max";

type MetricMap = {
  canonicalName: string;
  unit?: string;
  aggregation: "sum" | "avg";
  raw?: boolean;
};

type Accumulator = {
  sum: number;
  count: number;
  min: number;
  max: number;
  unit: string | null;
};

type InsertRow = Record<string, unknown>;

const EXPORT_DIR =
  process.argv.find((arg) => arg.startsWith("--path="))?.slice("--path=".length) ??
  "/Users/prateeksureka/Downloads/apple_health_export";
const PROFILE_ID = process.argv.find((arg) => arg.startsWith("--profileId="))?.slice(12);
const EMAIL =
  process.argv.find((arg) => arg.startsWith("--email="))?.slice("--email=".length) ??
  process.env.SEED_USER_EMAIL;
const FORCE = process.argv.includes("--force");

const QUANTITY_TYPES: Record<string, MetricMap> = {
  HKQuantityTypeIdentifierBloodGlucose: {
    canonicalName: "Blood Glucose",
    unit: "mg/dL",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierBodyMassIndex: {
    canonicalName: "BMI",
    unit: "count",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierHeight: {
    canonicalName: "Height",
    unit: "cm",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierBodyMass: {
    canonicalName: "Weight",
    unit: "kg",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierBodyFatPercentage: {
    canonicalName: "Body Fat Percentage",
    unit: "%",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierLeanBodyMass: {
    canonicalName: "Lean Body Mass",
    unit: "kg",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierHeartRate: {
    canonicalName: "Heart Rate",
    unit: "bpm",
    aggregation: "avg",
  },
  HKQuantityTypeIdentifierRestingHeartRate: {
    canonicalName: "Resting Heart Rate",
    unit: "bpm",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierWalkingHeartRateAverage: {
    canonicalName: "Walking Heart Rate Average",
    unit: "bpm",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: {
    canonicalName: "HRV",
    unit: "ms",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierVO2Max: {
    canonicalName: "VO2 Max",
    unit: "mL/kg/min",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierOxygenSaturation: {
    canonicalName: "Oxygen Saturation",
    unit: "%",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierRespiratoryRate: {
    canonicalName: "Respiratory Rate",
    unit: "breaths/min",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierBodyTemperature: {
    canonicalName: "Body Temperature",
    unit: "degC",
    aggregation: "avg",
  },
  HKQuantityTypeIdentifierStepCount: {
    canonicalName: "Steps",
    unit: "steps",
    aggregation: "sum",
  },
  HKQuantityTypeIdentifierDistanceWalkingRunning: {
    canonicalName: "Walking/Running Distance",
    unit: "km",
    aggregation: "sum",
  },
  HKQuantityTypeIdentifierDistanceCycling: {
    canonicalName: "Cycling Distance",
    unit: "km",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDistanceSwimming: {
    canonicalName: "Swimming Distance",
    unit: "m",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierSwimmingStrokeCount: {
    canonicalName: "Swimming Stroke Count",
    unit: "count",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierBasalEnergyBurned: {
    canonicalName: "Basal Energy Burned",
    unit: "kcal",
    aggregation: "sum",
  },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    canonicalName: "Active Energy Burned",
    unit: "kcal",
    aggregation: "sum",
  },
  HKQuantityTypeIdentifierFlightsClimbed: {
    canonicalName: "Flights Climbed",
    unit: "count",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierAppleExerciseTime: {
    canonicalName: "Exercise Time",
    unit: "min",
    aggregation: "sum",
  },
  HKQuantityTypeIdentifierAppleStandTime: {
    canonicalName: "Stand Time",
    unit: "min",
    aggregation: "sum",
  },
  HKQuantityTypeIdentifierWalkingSpeed: {
    canonicalName: "Walking Speed",
    unit: "km/hr",
    aggregation: "avg",
  },
  HKQuantityTypeIdentifierWalkingStepLength: {
    canonicalName: "Walking Step Length",
    unit: "cm",
    aggregation: "avg",
  },
  HKQuantityTypeIdentifierWalkingDoubleSupportPercentage: {
    canonicalName: "Walking Double Support Percentage",
    unit: "%",
    aggregation: "avg",
  },
  HKQuantityTypeIdentifierWalkingAsymmetryPercentage: {
    canonicalName: "Walking Asymmetry Percentage",
    unit: "%",
    aggregation: "avg",
  },
  HKQuantityTypeIdentifierAppleWalkingSteadiness: {
    canonicalName: "Walking Steadiness",
    unit: "%",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierSixMinuteWalkTestDistance: {
    canonicalName: "Six Minute Walk Test Distance",
    unit: "m",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierStairAscentSpeed: {
    canonicalName: "Stair Ascent Speed",
    unit: "m/s",
    aggregation: "avg",
  },
  HKQuantityTypeIdentifierStairDescentSpeed: {
    canonicalName: "Stair Descent Speed",
    unit: "m/s",
    aggregation: "avg",
  },
  HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: {
    canonicalName: "Heart Rate Recovery One Minute",
    unit: "bpm",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierPhysicalEffort: {
    canonicalName: "Physical Effort",
    unit: "kcal/hr·kg",
    aggregation: "avg",
  },
  HKQuantityTypeIdentifierEnvironmentalAudioExposure: {
    canonicalName: "Environmental Audio Exposure",
    unit: "dBASPL",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierHeadphoneAudioExposure: {
    canonicalName: "Headphone Audio Exposure",
    unit: "dBASPL",
    aggregation: "avg",
    raw: true,
  },
  HKDataTypeSleepDurationGoal: {
    canonicalName: "Sleep Duration Goal",
    unit: "hours",
    aggregation: "avg",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryEnergyConsumed: {
    canonicalName: "Dietary Energy Consumed",
    unit: "kcal",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryProtein: {
    canonicalName: "Dietary Protein",
    unit: "g",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryCarbohydrates: {
    canonicalName: "Dietary Carbohydrates",
    unit: "g",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietarySugar: {
    canonicalName: "Dietary Sugar",
    unit: "g",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryFiber: {
    canonicalName: "Dietary Fiber",
    unit: "g",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryFatTotal: {
    canonicalName: "Dietary Fat Total",
    unit: "g",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryFatSaturated: {
    canonicalName: "Dietary Fat Saturated",
    unit: "g",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryFatMonounsaturated: {
    canonicalName: "Dietary Fat Monounsaturated",
    unit: "g",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryFatPolyunsaturated: {
    canonicalName: "Dietary Fat Polyunsaturated",
    unit: "g",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryCholesterol: {
    canonicalName: "Dietary Cholesterol",
    unit: "mg",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietarySodium: {
    canonicalName: "Dietary Sodium",
    unit: "mg",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryPotassium: {
    canonicalName: "Dietary Potassium",
    unit: "mg",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryCalcium: {
    canonicalName: "Dietary Calcium",
    unit: "mg",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryIron: {
    canonicalName: "Dietary Iron",
    unit: "mg",
    aggregation: "sum",
    raw: true,
  },
  HKQuantityTypeIdentifierDietaryVitaminC: {
    canonicalName: "Dietary Vitamin C",
    unit: "mg",
    aggregation: "sum",
    raw: true,
  },
};

const SLEEP_VALUES: Record<string, string> = {
  HKCategoryValueSleepAnalysisInBed: "Sleep In Bed Duration",
  HKCategoryValueSleepAnalysisAsleepUnspecified: "Sleep Unspecified Duration",
  HKCategoryValueSleepAnalysisAwake: "Sleep Awake Duration",
  HKCategoryValueSleepAnalysisAsleepCore: "Sleep Core Duration",
  HKCategoryValueSleepAnalysisAsleepDeep: "Sleep Deep Duration",
  HKCategoryValueSleepAnalysisAsleepREM: "Sleep REM Duration",
};

const REQUIRED_TYPES = Array.from(
  new Set([
    ...Object.values(QUANTITY_TYPES).map((m) => m.canonicalName),
    ...Object.values(SLEEP_VALUES),
    "Stand Hours",
    "Workout Duration",
  ])
);

function attrMap(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of line.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function decodeXml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function parseAppleDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/);
  if (!match) return new Date(value);
  return new Date(`${match[1]}T${match[2]}${match[3]}${match[4]}:${match[5]}`);
}

function dayKey(value: string | undefined): string | null {
  return value?.slice(0, 10) ?? null;
}

function dayStart(day: string) {
  return new Date(`${day}T00:00:00+05:30`);
}

function dayEnd(day: string) {
  return new Date(`${day}T23:59:59.999+05:30`);
}

function durationHours(start: string | undefined, end: string | undefined) {
  const s = parseAppleDate(start);
  const e = parseAppleDate(end);
  if (!s || !e) return null;
  return Math.max(0, (e.getTime() - s.getTime()) / 3_600_000);
}

function stableId(...parts: Array<string | number | null | undefined>) {
  return createHash("sha256")
    .update(parts.map((p) => String(p ?? "")).join("|"))
    .digest("hex");
}

function deviceName(device: string | undefined) {
  return device?.match(/name:([^,>]+)/)?.[1]?.trim() ?? null;
}

function addRollup(
  rollups: Map<string, Accumulator>,
  typeId: string,
  day: string,
  aggregation: "sum" | "avg",
  value: number,
  unit: string | null
) {
  const key = `${day}|${typeId}|${aggregation === "sum" ? "daily_sum" : "daily_avg"}`;
  const acc = rollups.get(key) ?? {
    sum: 0,
    count: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    unit,
  };
  acc.sum += value;
  acc.count += 1;
  acc.min = Math.min(acc.min, value);
  acc.max = Math.max(acc.max, value);
  acc.unit = unit ?? acc.unit;
  rollups.set(key, acc);
}

async function fileHash(filePath: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", resolve)
      .on("error", reject);
  });
  return hash.digest("hex");
}

async function flushRows(pool: Pool, table: string, rows: InsertRow[], conflict: string) {
  if (!rows.length) return 0;
  const columns = Object.keys(rows[0]);
  const values: unknown[] = [];
  const groups = rows.map((row, rowIndex) => {
    const params = columns.map((column, colIndex) => {
      values.push(row[column]);
      return `$${rowIndex * columns.length + colIndex + 1}`;
    });
    return `(${params.join(", ")})`;
  });
  const result = await pool.query(
    `insert into ${table} (${columns.map((c) => `"${c}"`).join(", ")}) values ${groups.join(", ")} ${conflict}`,
    values
  );
  return result.rowCount ?? 0;
}

async function flushAll(
  pool: Pool,
  observations: InsertRow[],
  events: InsertRow[],
  counters: Record<string, number>
) {
  counters.observations += await flushRows(
    pool,
    "observations",
    observations,
    "on conflict (profile_id, external_source_type, external_source_id) do nothing"
  );
  observations.length = 0;
  counters.events += await flushRows(
    pool,
    "health_events",
    events,
    "on conflict (profile_id, external_source_type, external_source_id) do nothing"
  );
  events.length = 0;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const exportXml = path.join(EXPORT_DIR, "export.xml");
  const routeDir = path.join(EXPORT_DIR, "workout-routes");
  const sha256 = await fileHash(exportXml);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

  try {
    const profile = PROFILE_ID
      ? await pool.query("select id, user_id from profiles where id = $1", [PROFILE_ID])
      : await pool.query(
          `select p.id, p.user_id
             from profiles p
             join users u on u.id = p.user_id
            where u.email = $1 and p.relationship = 'self'
            order by p.created_at asc
            limit 1`,
          [EMAIL]
        );
    const profileId = profile.rows[0]?.id;
    if (!profileId) throw new Error("Profile not found. Pass --profileId=... or --email=...");

    const typeResult = await pool.query(
      "select id, canonical_name from observation_types where canonical_name = any($1)",
      [REQUIRED_TYPES]
    );
    const typeIds = new Map<string, string>(
      typeResult.rows.map((row) => [row.canonical_name, row.id])
    );
    const missing = REQUIRED_TYPES.filter((name) => !typeIds.has(name));
    if (missing.length) {
      throw new Error(`Missing observation types. Run db:seed first. Missing: ${missing.join(", ")}`);
    }

    const existing = await pool.query(
      "select id, status from health_imports where profile_id = $1 and sha256_hash = $2",
      [profileId, sha256]
    );
    if (existing.rows[0]?.status === "complete" && !FORCE) {
      console.log(`Apple Health export already imported for profile ${profileId}`);
      return;
    }

    const importId =
      existing.rows[0]?.id ??
      (
        await pool.query(
          `insert into health_imports
            (profile_id, source_system, source_format, original_filename, sha256_hash, status)
           values ($1, 'apple_health', 'apple_health_export_xml', $2, $3, 'processing')
           returning id`,
          [profileId, exportXml, sha256]
        )
      ).rows[0].id;

    if (existing.rows[0] && FORCE) {
      await pool.query("delete from observations where raw_import_id = $1", [importId]);
      await pool.query("delete from health_events where import_id = $1", [importId]);
      await pool.query("delete from health_rollups where import_id = $1", [importId]);
    }

    await pool.query("update health_imports set status = 'processing', error = null where id = $1", [
      importId,
    ]);

    const routeFiles = await readdir(routeDir).catch(() => []);
    const gpxCount = routeFiles.filter((file) => file.endsWith(".gpx")).length;
    const rollups = new Map<string, Accumulator>();
    const observations: InsertRow[] = [];
    const events: InsertRow[] = [];
    const counters = {
      records: 0,
      observations: 0,
      events: 0,
      workouts: 0,
      sleepSegments: 0,
      rollups: 0,
      activitySummaries: 0,
      gpxRoutes: gpxCount,
    };
    let exportDate: Date | null = null;
    let me: Record<string, string> | null = null;
    let currentWorkout: Record<string, string> | null = null;
    let workoutStats: Array<Record<string, string>> = [];
    let workoutEvents: Array<Record<string, string>> = [];
    let workoutHasRoute = false;

    const rl = readline.createInterface({
      input: createReadStream(exportXml),
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    for await (const rawLine of rl) {
      const line = rawLine.trim();

      if (line.startsWith("<ExportDate ")) {
        exportDate = parseAppleDate(attrMap(line).value);
      } else if (line.startsWith("<Me ")) {
        me = attrMap(line);
      } else if (line.startsWith("<Record ")) {
        counters.records += 1;
        const attrs = attrMap(line);
        const metric = QUANTITY_TYPES[attrs.type];
        const start = parseAppleDate(attrs.startDate);
        const end = parseAppleDate(attrs.endDate);
        const observedAt = end ?? start;
        const value = Number(attrs.value);
        const day = dayKey(attrs.startDate);

        if (metric && Number.isFinite(value) && day && observedAt) {
          const typeId = typeIds.get(metric.canonicalName)!;
          const normalized = normalizeMetricRecord({
            metric: metric.canonicalName,
            normalUnit: metric.unit ?? null,
            unit: metric.unit ?? attrs.unit ?? null,
            valueNumeric: value,
          });
          if (isImplausibleMetricObservation(metric.canonicalName, normalized.valueNumeric)) {
            continue;
          }
          const unit = normalized.unit;
          addRollup(
            rollups,
            typeId,
            day,
            metric.aggregation,
            normalized.valueNumeric ?? value,
            unit
          );

          if (metric.raw) {
            observations.push({
              profile_id: profileId,
              observation_type_id: typeId,
              observed_at: observedAt,
              start_at: start,
              end_at: end,
              value_numeric: normalized.valueNumeric ?? value,
              unit,
              interpretation: "unknown",
              source: "apple_health",
              aggregation: start && end && start.getTime() !== end.getTime() ? "interval" : "instant",
              external_source_type: attrs.type,
              external_source_id: stableId(attrs.type, attrs.startDate, attrs.endDate, attrs.value, attrs.unit, attrs.sourceName),
              source_name: attrs.sourceName ?? null,
              device_name: deviceName(attrs.device),
              metadata_json: JSON.stringify({
                sourceVersion: attrs.sourceVersion,
                creationDate: attrs.creationDate,
              }),
              raw_import_id: importId,
              confidence: 1,
              status: "confirmed",
            });
          }
        } else if (attrs.type === "HKCategoryTypeIdentifierSleepAnalysis") {
          const canonicalName = SLEEP_VALUES[attrs.value];
          const hours = durationHours(attrs.startDate, attrs.endDate);
          const dayForSleep = dayKey(attrs.endDate) ?? dayKey(attrs.startDate);
          if (canonicalName && hours != null && dayForSleep && start) {
            const typeId = typeIds.get(canonicalName)!;
            addRollup(rollups, typeId, dayForSleep, "sum", hours, "hours");
            events.push({
              profile_id: profileId,
              import_id: importId,
              event_type: "sleep_stage",
              label: canonicalName,
              start_at: start,
              end_at: end,
              source: "apple_health",
              source_name: attrs.sourceName ?? null,
              device_name: deviceName(attrs.device),
              metadata_json: JSON.stringify({
                value: attrs.value,
                sourceVersion: attrs.sourceVersion,
                creationDate: attrs.creationDate,
              }),
              external_source_type: attrs.type,
              external_source_id: stableId(attrs.type, attrs.startDate, attrs.endDate, attrs.value, attrs.sourceName),
            });
            counters.sleepSegments += 1;
          }
        } else if (attrs.type === "HKCategoryTypeIdentifierAppleStandHour") {
          const dayForStand = dayKey(attrs.startDate);
          if (attrs.value === "HKCategoryValueAppleStandHourStood" && dayForStand) {
            addRollup(rollups, typeIds.get("Stand Hours")!, dayForStand, "sum", 1, "count");
          }
        } else if (
          attrs.type === "HKCategoryTypeIdentifierHighHeartRateEvent" ||
          attrs.type === "HKCategoryTypeIdentifierMindfulSession"
        ) {
          if (start) {
            events.push({
              profile_id: profileId,
              import_id: importId,
              event_type:
                attrs.type === "HKCategoryTypeIdentifierHighHeartRateEvent"
                  ? "high_heart_rate_event"
                  : "mindful_session",
              label:
                attrs.type === "HKCategoryTypeIdentifierHighHeartRateEvent"
                  ? "High heart rate event"
                  : "Mindful session",
              start_at: start,
              end_at: end,
              source: "apple_health",
              source_name: attrs.sourceName ?? null,
              device_name: deviceName(attrs.device),
              metadata_json: JSON.stringify({
                value: attrs.value,
                sourceVersion: attrs.sourceVersion,
                creationDate: attrs.creationDate,
              }),
              external_source_type: attrs.type,
              external_source_id: stableId(attrs.type, attrs.startDate, attrs.endDate, attrs.value, attrs.sourceName),
            });
          }
        }
      } else if (line.startsWith("<ActivitySummary ")) {
        counters.activitySummaries += 1;
        const attrs = attrMap(line);
        const day = attrs.dateComponents;
        if (day) {
          const activeType = typeIds.get("Active Energy Burned")!;
          const exerciseType = typeIds.get("Exercise Time")!;
          const standType = typeIds.get("Stand Hours")!;
          addRollup(rollups, activeType, day, "sum", Number(attrs.activeEnergyBurned) || 0, attrs.activeEnergyBurnedUnit ?? "kcal");
          addRollup(rollups, exerciseType, day, "sum", Number(attrs.appleExerciseTime) || 0, "min");
          addRollup(rollups, standType, day, "sum", Number(attrs.appleStandHours) || 0, "count");
        }
      } else if (line.startsWith("<Workout ")) {
        currentWorkout = attrMap(line);
        workoutStats = [];
        workoutEvents = [];
        workoutHasRoute = false;
      } else if (currentWorkout && line.startsWith("<WorkoutStatistics ")) {
        workoutStats.push(attrMap(line));
      } else if (currentWorkout && line.startsWith("<WorkoutEvent ")) {
        workoutEvents.push(attrMap(line));
      } else if (currentWorkout && line.startsWith("<WorkoutRoute ")) {
        workoutHasRoute = true;
      } else if (currentWorkout && line.startsWith("</Workout>")) {
        const start = parseAppleDate(currentWorkout.startDate);
        const end = parseAppleDate(currentWorkout.endDate);
        if (start) {
          counters.workouts += 1;
          const label = currentWorkout.workoutActivityType.replace(/^HKWorkoutActivityType/, "");
          events.push({
            profile_id: profileId,
            import_id: importId,
            event_type: "workout",
            label,
            start_at: start,
            end_at: end,
            source: "apple_health",
            source_name: currentWorkout.sourceName ?? null,
            device_name: deviceName(currentWorkout.device),
            metadata_json: JSON.stringify({
              activityType: currentWorkout.workoutActivityType,
              duration: Number(currentWorkout.duration),
              durationUnit: currentWorkout.durationUnit,
              totalDistance: currentWorkout.totalDistance ? Number(currentWorkout.totalDistance) : null,
              totalDistanceUnit: currentWorkout.totalDistanceUnit ?? null,
              totalEnergyBurned: currentWorkout.totalEnergyBurned ? Number(currentWorkout.totalEnergyBurned) : null,
              totalEnergyBurnedUnit: currentWorkout.totalEnergyBurnedUnit ?? null,
              sourceVersion: currentWorkout.sourceVersion,
              creationDate: currentWorkout.creationDate,
              statistics: workoutStats,
              events: workoutEvents,
              routeAvailable: workoutHasRoute,
            }),
            external_source_type: "HKWorkout",
            external_source_id: stableId(
              currentWorkout.workoutActivityType,
              currentWorkout.startDate,
              currentWorkout.endDate,
              currentWorkout.duration,
              currentWorkout.sourceName
            ),
          });
          if (currentWorkout.duration) {
            const day = dayKey(currentWorkout.startDate);
            if (day) {
              addRollup(
                rollups,
                typeIds.get("Workout Duration")!,
                day,
                "sum",
                Number(currentWorkout.duration),
                currentWorkout.durationUnit ?? "min"
              );
            }
          }
        }
        currentWorkout = null;
      }

      if (observations.length >= 1000 || events.length >= 1000) {
        await flushAll(pool, observations, events, counters);
      }
    }

    await flushAll(pool, observations, events, counters);

    const rollupRows: InsertRow[] = [];
    for (const [key, acc] of rollups) {
      const [day, typeId, aggregation] = key.split("|") as [string, string, RollupAggregation];
      rollupRows.push({
        profile_id: profileId,
        import_id: importId,
        period: "day",
        period_start: dayStart(day),
        period_end: dayEnd(day),
        observation_type_id: typeId,
        value_numeric: aggregation === "daily_sum" ? acc.sum : acc.sum / acc.count,
        unit: acc.unit,
        aggregation,
        source_observation_count: acc.count,
        metadata_json: JSON.stringify({ min: acc.min, max: acc.max }),
      });
      if (aggregation === "daily_avg") {
        rollupRows.push({
          profile_id: profileId,
          import_id: importId,
          period: "day",
          period_start: dayStart(day),
          period_end: dayEnd(day),
          observation_type_id: typeId,
          value_numeric: acc.min,
          unit: acc.unit,
          aggregation: "min",
          source_observation_count: acc.count,
          metadata_json: JSON.stringify({ derivedFrom: "daily_avg" }),
        });
        rollupRows.push({
          profile_id: profileId,
          import_id: importId,
          period: "day",
          period_start: dayStart(day),
          period_end: dayEnd(day),
          observation_type_id: typeId,
          value_numeric: acc.max,
          unit: acc.unit,
          aggregation: "max",
          source_observation_count: acc.count,
          metadata_json: JSON.stringify({ derivedFrom: "daily_avg" }),
        });
      }
      if (rollupRows.length >= 1000) {
        counters.rollups += await flushRows(
          pool,
          "health_rollups",
          rollupRows,
          `on conflict (profile_id, period, period_start, observation_type_id, aggregation)
           do update set value_numeric = excluded.value_numeric,
                         unit = excluded.unit,
                         source_observation_count = excluded.source_observation_count,
                         metadata_json = excluded.metadata_json,
                         import_id = excluded.import_id`
        );
        rollupRows.length = 0;
      }
    }
    counters.rollups += await flushRows(
      pool,
      "health_rollups",
      rollupRows,
      `on conflict (profile_id, period, period_start, observation_type_id, aggregation)
       do update set value_numeric = excluded.value_numeric,
                     unit = excluded.unit,
                     source_observation_count = excluded.source_observation_count,
                     metadata_json = excluded.metadata_json,
                     import_id = excluded.import_id`
    );

    if (me) {
      await pool.query(
        `update profiles
            set date_of_birth = coalesce(date_of_birth, $2),
                sex_at_birth = case
                  when sex_at_birth = 'unknown' and $3 = 'HKBiologicalSexMale' then 'male'::sex_at_birth
                  when sex_at_birth = 'unknown' and $3 = 'HKBiologicalSexFemale' then 'female'::sex_at_birth
                  else sex_at_birth
                end,
                blood_group = coalesce(
                  blood_group,
                  case $4
                    when 'HKBloodTypeAPositive' then 'A+'
                    when 'HKBloodTypeANegative' then 'A-'
                    when 'HKBloodTypeBPositive' then 'B+'
                    when 'HKBloodTypeBNegative' then 'B-'
                    when 'HKBloodTypeABPositive' then 'AB+'
                    when 'HKBloodTypeABNegative' then 'AB-'
                    when 'HKBloodTypeOPositive' then 'O+'
                    when 'HKBloodTypeONegative' then 'O-'
                    else null
                  end
                )
          where id = $1`,
        [
          profileId,
          me.HKCharacteristicTypeIdentifierDateOfBirth || null,
          me.HKCharacteristicTypeIdentifierBiologicalSex || null,
          me.HKCharacteristicTypeIdentifierBloodType || null,
        ]
      );
    }

    await pool.query(
      `update health_imports
          set status = 'complete',
              external_export_date = $2,
              summary_json = $3,
              completed_at = now()
        where id = $1`,
      [importId, exportDate, JSON.stringify(counters)]
    );

    console.log(
      JSON.stringify(
        {
          profileId,
          importId,
          ...counters,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
