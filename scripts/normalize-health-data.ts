import { config } from "dotenv";
import { Pool } from "pg";
import {
  isImplausibleMetricObservation,
  normalizeMetricRecord,
} from "../src/lib/health/normalization";

const useProduction = process.argv.includes("--production");
const apply = process.argv.includes("--apply");

if (useProduction) config({ path: ".env.production.local" });
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const summary = {
    observationRowsScanned: 0,
    observationRowsUpdated: 0,
    observationRowsRejected: 0,
    rollupRowsScanned: 0,
    rollupRowsUpdated: 0,
  };

  try {
    const observations = await pool.query<{
      id: string;
      canonical_name: string;
      normal_unit: string | null;
      unit: string | null;
      value_numeric: number | null;
      reference_low: number | null;
      reference_high: number | null;
      status: string;
    }>(`
      select
        o.id,
        ot.canonical_name,
        ot.normal_unit,
        o.unit,
        o.value_numeric,
        o.reference_low,
        o.reference_high,
        o.status
      from observations o
      join observation_types ot on ot.id = o.observation_type_id
    `);

    for (const row of observations.rows) {
      summary.observationRowsScanned += 1;
      const implausible = isImplausibleMetricObservation(row.canonical_name, row.value_numeric);
      const normalized = normalizeMetricRecord({
        metric: row.canonical_name,
        normalUnit: row.normal_unit,
        unit: row.unit,
        valueNumeric: row.value_numeric,
        referenceLow: row.reference_low,
        referenceHigh: row.reference_high,
      });
      const changed =
        normalized.unit !== row.unit ||
        normalized.valueNumeric !== row.value_numeric ||
        normalized.referenceLow !== row.reference_low ||
        normalized.referenceHigh !== row.reference_high;

      if (implausible && row.status !== "rejected") {
        summary.observationRowsRejected += 1;
        if (apply) {
          await pool.query(
            `update observations set status = 'rejected', updated_at = now() where id = $1`,
            [row.id]
          );
        }
      }

      if (changed) {
        summary.observationRowsUpdated += 1;
        if (apply) {
          await pool.query(
            `update observations
             set unit = $2,
                 value_numeric = $3,
                 reference_low = $4,
                 reference_high = $5,
                 updated_at = now()
             where id = $1`,
            [
              row.id,
              normalized.unit,
              normalized.valueNumeric,
              normalized.referenceLow,
              normalized.referenceHigh,
            ]
          );
        }
      }
    }

    const rollups = await pool.query<{
      id: string;
      canonical_name: string;
      normal_unit: string | null;
      unit: string | null;
      value_numeric: number;
    }>(`
      select
        hr.id,
        ot.canonical_name,
        ot.normal_unit,
        hr.unit,
        hr.value_numeric
      from health_rollups hr
      join observation_types ot on ot.id = hr.observation_type_id
    `);

    for (const row of rollups.rows) {
      summary.rollupRowsScanned += 1;
      const normalized = normalizeMetricRecord({
        metric: row.canonical_name,
        normalUnit: row.normal_unit,
        unit: row.unit,
        valueNumeric: row.value_numeric,
      });
      const changed =
        normalized.unit !== row.unit || normalized.valueNumeric !== row.value_numeric;

      if (changed) {
        summary.rollupRowsUpdated += 1;
        if (apply) {
          await pool.query(
            `update health_rollups
             set unit = $2,
                 value_numeric = $3
             where id = $1`,
            [row.id, normalized.unit, normalized.valueNumeric]
          );
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          database: useProduction ? "production" : "local",
          summary,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
