import "server-only";

import type { PoolClient } from "pg";
import { pool } from "@/db";
import { quoteIdentifier } from "./config";
import { healthDailyDate, healthDailyMetrics, type HealthDailyRow } from "./daily";

const EXTERNAL_TYPE = "health_bridge_daily";

type InsertRow = Record<string, unknown>;

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
    const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier("health_daily")}`;

    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `hearth:health-bridge-sync:${profileId}`,
    ]);

    const table = await client.query<{ table_name: string | null }>(
      "select to_regclass($1)::text as table_name",
      [`${schemaName}.health_daily`]
    );
    if (!table.rows[0]?.table_name) {
      await client.query("commit");
      return { status: "waiting_for_data" };
    }

    const fingerprintResult = await client.query<{
      row_count: number;
      max_date: string | null;
      max_synced_at: string | null;
      content_hash: string;
    }>(
      `select count(*)::int as row_count,
              max(date)::text as max_date,
              max(synced_at)::text as max_synced_at,
              md5(coalesce(string_agg(md5(to_jsonb(day)::text), '' order by date), '')) as content_hash
         from ${qualifiedTable} day`
    );
    const fingerprint = JSON.stringify(fingerprintResult.rows[0]);
    const previous = await client.query<{ last_anchor: string | null }>(
      `select last_anchor
         from health_sync_state
        where profile_id = $1
          and source_system = 'apple_health'
          and external_type = $2`,
      [profileId, EXTERNAL_TYPE]
    );
    if (previous.rows[0]?.last_anchor === fingerprint) {
      await client.query("commit");
      return { status: "unchanged" };
    }

    const dailyResult = await client.query<{ data: HealthDailyRow }>(
      `select to_jsonb(day) as data from ${qualifiedTable} day order by date`
    );
    const canonicalNames = [
      ...new Set(dailyResult.rows.flatMap(({ data }) => healthDailyMetrics(data).map((m) => m.canonicalName))),
    ];
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
       values ($1, 'apple_health', 'health_bridge_daily', 'Health Bridge iOS', $2, 'processing')
       on conflict (profile_id, sha256_hash)
       do update set status = 'processing', error = null
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

    for (const { data } of dailyResult.rows) {
      const day = healthDailyDate(data);
      if (!day) continue;
      const observedAt = new Date(`${day}T12:00:00+05:30`);
      const periodStart = new Date(`${day}T00:00:00+05:30`);
      const periodEnd = new Date(`${day}T23:59:59.999+05:30`);

      for (const metric of healthDailyMetrics(data)) {
        const observationTypeId = typeIds.get(metric.canonicalName);
        if (!observationTypeId) continue;
        const metadata = {
          source: "health_bridge",
          column: metric.column,
          syncedAt: data.synced_at ?? null,
        };
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
          external_source_id: `${day}:${metric.column}`,
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
          source_observation_count: 1,
          metadata_json: metadata,
        });
      }

      const workoutCount = Number(data.workout_count ?? 0);
      if (Number.isFinite(workoutCount) && workoutCount > 0) {
        events.push({
          profile_id: profileId,
          import_id: importId,
          event_type: "workout_summary",
          label: `${workoutCount} workout${workoutCount === 1 ? "" : "s"}`,
          start_at: observedAt,
          source: "apple_health",
          source_name: "Health Bridge iOS",
          metadata_json: {
            workoutCount,
            workoutMinutes: data.workout_minutes ?? null,
            workoutTypes: data.workout_types ?? [],
          },
          external_source_type: EXTERNAL_TYPE,
          external_source_id: `${day}:workouts`,
        });
      }
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
      dailyRows: dailyResult.rowCount,
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
      [profileId, EXTERNAL_TYPE, fingerprint]
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
