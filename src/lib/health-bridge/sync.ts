import "server-only";

import type { PoolClient } from "pg";
import { pool } from "@/db";
import { quoteIdentifier } from "./config";
import { healthDailyDate, healthDailyMetrics, type HealthDailyMetric, type HealthDailyRow } from "./daily";
import {
  healthSampleAggregateMetric,
  type AggregatedHealthSampleMetric,
  type HealthSampleAggregateRow,
} from "./samples";

const EXTERNAL_TYPE = "health_bridge_daily";
const BRIDGE_TIME_ZONE = process.env.HEALTH_BRIDGE_TIMEZONE ?? "Asia/Kolkata";

type InsertRow = Record<string, unknown>;

type DailyMetric = {
  date: string;
  metric: HealthDailyMetric;
  sourceCount: number;
  metadata: Record<string, unknown>;
};

async function insertRows(
  client: PoolClient,
  table: string,
  rows: InsertRow[],
  conflict: string
) {
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = rows.slice(offset, offset + 400);
    const columns = Object.keys(batch[0]);
    const values: unknown[] = [];
    const groups = batch.map((row) => {
      const parameters = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${parameters.join(", ")})`;
    });
    await client.query(
      `insert into ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")})
       values ${groups.join(", ")}
       ${conflict}`,
      values
    );
  }
}

export type HealthBridgeSyncResult = {
  status: "not_configured" | "waiting_for_data" | "unchanged" | "synced" | "failed";
  dailyRows?: number;
  sampleRows?: number;
  observations?: number;
  events?: number;
  error?: string;
};

export async function syncHealthBridgeProfile(profileId: string): Promise<HealthBridgeSyncResult> {
  const client = await pool.connect();
  let connectionId: string | null = null;

  try {
    const connection = await client.query<{ id: string; schema_name: string }>(
      `select id, schema_name from health_bridge_connections where profile_id = $1`,
      [profileId]
    );
    if (!connection.rowCount) return { status: "not_configured" };
    connectionId = connection.rows[0].id;
    const schemaName = connection.rows[0].schema_name;
    const dailyTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier("health_daily")}`;
    const samplesTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier("health_samples")}`;

    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `hearth:health-bridge-sync:${profileId}`,
    ]);

    const tables = await client.query<{ daily_table: string | null; samples_table: string | null }>(
      "select to_regclass($1)::text as daily_table, to_regclass($2)::text as samples_table",
      [`${schemaName}.health_daily`, `${schemaName}.health_samples`]
    );
    const hasDaily = Boolean(tables.rows[0]?.daily_table);
    const hasSamples = Boolean(tables.rows[0]?.samples_table);
    if (!hasDaily && !hasSamples) {
      await client.query("commit");
      return { status: "waiting_for_data" };
    }

    const fingerprint: Record<string, unknown> = {};
    let sampleRowCount = 0;
    if (hasDaily) {
      const result = await client.query(
        `select count(*)::int as row_count,
                max(date)::text as max_date,
                max(synced_at)::text as max_synced_at,
                md5(coalesce(string_agg(md5(to_jsonb(day)::text), '' order by date), '')) as content_hash
           from ${dailyTable} day`
      );
      fingerprint.healthDaily = result.rows[0];
    }
    if (hasSamples) {
      const result = await client.query<{
        row_count: number;
        max_start_at: string | null;
        max_synced_at: string | null;
      }>(
        `select count(*)::int as row_count,
                max(start_at)::text as max_start_at,
                max(synced_at)::text as max_synced_at
           from ${samplesTable}`
      );
      fingerprint.healthSamples = result.rows[0];
      sampleRowCount = Number(result.rows[0]?.row_count ?? 0);
    }
    const anchor = JSON.stringify(fingerprint);
    const previous = await client.query<{ last_anchor: string | null }>(
      `select last_anchor
         from health_sync_state
        where profile_id = $1
          and source_system = 'apple_health'
          and external_type = $2`,
      [profileId, EXTERNAL_TYPE]
    );
    if (previous.rows[0]?.last_anchor === anchor) {
      await client.query("commit");
      return { status: "unchanged", sampleRows: sampleRowCount };
    }

    const dailyResult = hasDaily
      ? await client.query<{ data: HealthDailyRow }>(
          `select to_jsonb(day) as data from ${dailyTable} day order by date`
        )
      : { rows: [] as Array<{ data: HealthDailyRow }>, rowCount: 0 };
    const sampleResult = hasSamples
      ? await client.query<HealthSampleAggregateRow>(
          `select (start_at at time zone $1)::date as day,
                  data_type,
                  min(unit) as unit,
                  count(*)::int as sample_count,
                  sum(numeric_value) as sum_value,
                  avg(numeric_value) as avg_value,
                  max(synced_at) as latest_synced_at,
                  array_remove(array_agg(distinct source_name), null) as source_names
             from ${samplesTable}
            where numeric_value is not null
            group by 1, data_type, unit
            order by 1, data_type`,
          [BRIDGE_TIME_ZONE]
        )
      : { rows: [] as HealthSampleAggregateRow[] };

    // Raw samples are only a fallback/provenance source. Health Bridge's
    // reviewed daily projection wins when both tables contain the same metric.
    const metricMap = new Map<string, DailyMetric>();
    let mappedSampleGroups = 0;
    for (const row of sampleResult.rows) {
      const sample = healthSampleAggregateMetric(row);
      if (!sample) continue;
      mappedSampleGroups += 1;
      metricMap.set(`${sample.date}:${sample.column}`, sampleDailyMetric(sample));
    }
    for (const { data } of dailyResult.rows) {
      const date = healthDailyDate(data);
      if (!date) continue;
      for (const metric of healthDailyMetrics(data)) {
        const key = `${date}:${metric.column}`;
        const sample = metricMap.get(key);
        metricMap.set(key, {
          date,
          metric,
          sourceCount: sample?.sourceCount ?? 1,
          metadata: {
            source: "health_bridge",
            sourceTables: sample ? ["health_samples", "health_daily"] : ["health_daily"],
            column: metric.column,
            syncedAt: data.synced_at ?? null,
            sampleSources: sample?.metadata.sampleSources ?? [],
          },
        });
      }
    }

    const dailyMetrics = [...metricMap.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.metric.column.localeCompare(b.metric.column)
    );
    const canonicalNames = [...new Set(dailyMetrics.map(({ metric }) => metric.canonicalName))];
    const types = canonicalNames.length
      ? await client.query<{ id: string; canonical_name: string }>(
          "select id, canonical_name from observation_types where canonical_name = any($1)",
          [canonicalNames]
        )
      : { rows: [] };
    const typeIds = new Map(types.rows.map((row) => [row.canonical_name, row.id]));

    const importResult = await client.query<{ id: string }>(
      `insert into health_imports
        (profile_id, source_system, source_format, original_filename, sha256_hash, status)
       values ($1, 'apple_health', 'health_bridge', 'Health Bridge iOS', $2, 'processing')
       on conflict (profile_id, sha256_hash)
       do update set source_format = 'health_bridge', status = 'processing', error = null
       returning id`,
      [profileId, `health-bridge:${profileId}`]
    );
    const importId = importResult.rows[0].id;
    await client.query(
      `delete from observations
        where profile_id = $1 and external_source_type = $2 and raw_import_id = $3`,
      [profileId, EXTERNAL_TYPE, importId]
    );
    await client.query(
      `delete from health_events
        where profile_id = $1 and external_source_type = $2 and import_id = $3`,
      [profileId, EXTERNAL_TYPE, importId]
    );
    await client.query("delete from health_rollups where profile_id = $1 and import_id = $2", [
      profileId,
      importId,
    ]);

    const observations: InsertRow[] = [];
    const rollups: InsertRow[] = [];
    const events: InsertRow[] = [];
    for (const { date, metric, sourceCount, metadata } of dailyMetrics) {
      const observationTypeId = typeIds.get(metric.canonicalName);
      if (!observationTypeId) continue;
      const observedAt = new Date(`${date}T12:00:00+05:30`);
      const periodStart = new Date(`${date}T00:00:00+05:30`);
      const periodEnd = new Date(`${date}T23:59:59.999+05:30`);
      observations.push({
        profile_id: profileId,
        observation_type_id: observationTypeId,
        observed_at: observedAt,
        start_at: periodStart,
        end_at: periodEnd,
        value_numeric: metric.value,
        unit: metric.unit,
        interpretation: "unknown",
        source: "apple_health",
        aggregation: metric.aggregation,
        external_source_type: EXTERNAL_TYPE,
        external_source_id: `${date}:${metric.column}`,
        source_name: "Health Bridge iOS",
        metadata_json: metadata,
        raw_import_id: importId,
        confidence: 1,
        status: "confirmed",
      });
      rollups.push({
        profile_id: profileId,
        import_id: importId,
        period: "day",
        period_start: periodStart,
        period_end: periodEnd,
        observation_type_id: observationTypeId,
        value_numeric: metric.value,
        unit: metric.unit,
        aggregation: metric.aggregation,
        source_observation_count: sourceCount,
        metadata_json: metadata,
      });
    }

    for (const { data } of dailyResult.rows) {
      const date = healthDailyDate(data);
      const workoutCount = Number(data.workout_count ?? 0);
      if (!date || !Number.isFinite(workoutCount) || workoutCount <= 0) continue;
      events.push({
        profile_id: profileId,
        import_id: importId,
        event_type: "workout_summary",
        label: `${workoutCount} workout${workoutCount === 1 ? "" : "s"}`,
        start_at: new Date(`${date}T12:00:00+05:30`),
        source: "apple_health",
        source_name: "Health Bridge iOS",
        metadata_json: {
          workoutCount,
          workoutMinutes: data.workout_minutes ?? null,
          workoutTypes: data.workout_types ?? [],
        },
        external_source_type: EXTERNAL_TYPE,
        external_source_id: `${date}:workouts`,
      });
    }

    if (observations.length) {
      await insertRows(
        client,
        "observations",
        observations,
        `on conflict (profile_id, external_source_type, external_source_id)
         do update set observed_at = excluded.observed_at,
                       start_at = excluded.start_at,
                       end_at = excluded.end_at,
                       value_numeric = excluded.value_numeric,
                       unit = excluded.unit,
                       aggregation = excluded.aggregation,
                       source_name = excluded.source_name,
                       metadata_json = excluded.metadata_json,
                       raw_import_id = excluded.raw_import_id,
                       status = 'confirmed',
                       updated_at = now()`
      );
    }
    if (rollups.length) {
      await insertRows(
        client,
        "health_rollups",
        rollups,
        `on conflict (profile_id, period, period_start, observation_type_id, aggregation)
         do update set period_end = excluded.period_end,
                       value_numeric = excluded.value_numeric,
                       unit = excluded.unit,
                       source_observation_count = excluded.source_observation_count,
                       metadata_json = excluded.metadata_json,
                       import_id = excluded.import_id`
      );
    }
    if (events.length) {
      await insertRows(
        client,
        "health_events",
        events,
        `on conflict (profile_id, external_source_type, external_source_id)
         do update set label = excluded.label,
                       start_at = excluded.start_at,
                       source_name = excluded.source_name,
                       metadata_json = excluded.metadata_json,
                       import_id = excluded.import_id`
      );
    }

    const summary = {
      dailyRows: dailyResult.rowCount ?? 0,
      sampleRows: sampleRowCount,
      mappedSampleGroups,
      observations: observations.length,
      rollups: rollups.length,
      events: events.length,
    };
    await client.query(
      `update health_imports
          set status = 'complete', summary_json = $2, completed_at = now(), error = null
        where id = $1`,
      [importId, summary]
    );
    await client.query(
      `insert into health_sync_state
        (profile_id, source_system, external_type, last_synced_at, last_anchor, status, error)
       values ($1, 'apple_health', $2, now(), $3, 'complete', null)
       on conflict (profile_id, source_system, external_type)
       do update set last_synced_at = now(), last_anchor = excluded.last_anchor,
                     status = 'complete', error = null`,
      [profileId, EXTERNAL_TYPE, anchor]
    );
    await client.query(
      `update health_bridge_connections
          set last_synced_at = now(), last_error = null, updated_at = now()
        where id = $1`,
      [connectionId]
    );
    await client.query("commit");

    return {
      status: "synced",
      dailyRows: dailyResult.rowCount ?? 0,
      sampleRows: sampleRowCount,
      observations: observations.length,
      events: events.length,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const message = error instanceof Error ? error.message : "Health Bridge sync failed";
    if (connectionId) {
      await pool
        .query(
          `update health_bridge_connections
              set last_error = $2, updated_at = now()
            where id = $1`,
          [connectionId, message.slice(0, 2000)]
        )
        .catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

function sampleDailyMetric(sample: AggregatedHealthSampleMetric): DailyMetric {
  return {
    date: sample.date,
    metric: sample,
    sourceCount: sample.sourceCount,
    metadata: {
      source: "health_bridge",
      sourceTables: ["health_samples"],
      column: sample.column,
      syncedAt: sample.syncedAt,
      sampleSources: sample.sourceNames,
    },
  };
}

export async function trySyncHealthBridgeProfile(
  profileId: string
): Promise<HealthBridgeSyncResult> {
  try {
    return await syncHealthBridgeProfile(profileId);
  } catch (error) {
    console.error("Health Bridge sync failed", error);
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Health Bridge sync failed",
    };
  }
}
