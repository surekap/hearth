import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getMarkers, type Marker } from "./markers";
import { categoryLabel } from "./systems";
import {
  downsampleEven,
  MAX_RAW_POINTS,
  rangeStart,
  rawSeries,
  rollupPeriodFor,
  rollupSeries,
  shouldUseRollups,
  trendOf,
  type Interpretation,
  type MetricSeries,
  type RangeKey,
  type RollupBucketRow,
} from "./series";

export type MetricIndexRow = {
  typeId: string;
  name: string;
  category: string;
  categoryLabel: string;
  unit: string | null;
  latestValue: number | null;
  latestText: string | null;
  latestDate: string;
  interpretation: Interpretation;
  pointCount: number;
};

/** Latest confirmed value + total count for every metric type with data. */
export async function getMetricIndex(profileId: string): Promise<MetricIndexRow[]> {
  const result = await db.execute(sql`
    select distinct on (o.observation_type_id)
      ot.id as type_id,
      ot.canonical_name as name,
      ot.category as category,
      coalesce(o.unit, ot.normal_unit) as unit,
      o.value_numeric as latest_value,
      o.value_text as latest_text,
      o.observed_at as latest_date,
      o.interpretation as interpretation,
      count(*) over (partition by o.observation_type_id)::int as point_count
    from observations o
    join observation_types ot on ot.id = o.observation_type_id
    where o.profile_id = ${profileId} and o.status = 'confirmed'
    order by o.observation_type_id, o.observed_at desc
  `);
  const rows = result.rows as Array<{
    type_id: string;
    name: string;
    category: string;
    unit: string | null;
    latest_value: number | null;
    latest_text: string | null;
    latest_date: Date;
    interpretation: Interpretation;
    point_count: number;
  }>;
  return rows
    .map((r) => ({
      typeId: r.type_id,
      name: r.name,
      category: r.category,
      categoryLabel: categoryLabel(r.category),
      unit: r.unit,
      latestValue: r.latest_value == null ? null : Number(r.latest_value),
      latestText: r.latest_text,
      latestDate: new Date(r.latest_date).toISOString(),
      interpretation: r.interpretation,
      pointCount: Number(r.point_count),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type RawRow = {
  observedAt: Date;
  valueNumeric: number | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: Interpretation;
};

async function loadRawRows(profileId: string, typeId: string, start: Date | null) {
  const conditions = [
    eq(schema.observations.profileId, profileId),
    eq(schema.observations.observationTypeId, typeId),
    eq(schema.observations.status, "confirmed"),
  ];
  if (start) conditions.push(gte(schema.observations.observedAt, start));
  return db
    .select({
      observedAt: schema.observations.observedAt,
      valueNumeric: schema.observations.valueNumeric,
      referenceLow: schema.observations.referenceLow,
      referenceHigh: schema.observations.referenceHigh,
      interpretation: schema.observations.interpretation,
    })
    .from(schema.observations)
    .where(and(...conditions))
    .orderBy(asc(schema.observations.observedAt));
}

async function loadRollupBuckets(
  profileId: string,
  typeId: string,
  start: Date | null,
  period: "day" | "week" | "month"
): Promise<RollupBucketRow[]> {
  // Only day rollups exist; week/month buckets are computed here with
  // date_trunc. Averages are weighted by source_observation_count so a day
  // with 40 readings counts more than a day with 2.
  const result = await db.execute(sql`
    select
      date_trunc(${period}, period_start) as bucket,
      sum(case when aggregation = 'daily_avg' then value_numeric * greatest(source_observation_count, 1) end)
        / nullif(sum(case when aggregation = 'daily_avg' then greatest(source_observation_count, 1) end), 0) as avg_value,
      sum(case when aggregation = 'daily_sum' then value_numeric end) as sum_value,
      min(case when aggregation = 'min' then value_numeric end) as min_value,
      max(case when aggregation = 'max' then value_numeric end) as max_value,
      coalesce(sum(case when aggregation in ('daily_avg', 'daily_sum') then greatest(source_observation_count, 1) end), 0)::int as source_count
    from health_rollups
    where profile_id = ${profileId}
      and observation_type_id = ${typeId}
      and period = 'day'
      ${start ? sql`and period_start >= ${start}` : sql``}
    group by 1
    order by 1
  `);
  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    bucket: new Date(r.bucket as string),
    avgValue: r.avg_value == null ? null : Number(r.avg_value),
    sumValue: r.sum_value == null ? null : Number(r.sum_value),
    minValue: r.min_value == null ? null : Number(r.min_value),
    maxValue: r.max_value == null ? null : Number(r.max_value),
    sourceCount: Number(r.source_count),
  }));
}

/** Chart series for one metric — rollup band when dense, raw points when sparse. */
export async function loadMetricSeries(
  profileId: string,
  typeId: string,
  range: RangeKey
): Promise<MetricSeries> {
  const start = rangeStart(range);
  const raw = (await loadRawRows(profileId, typeId, start)).filter(
    (r): r is RawRow & { valueNumeric: number } => r.valueNumeric != null
  );

  if (shouldUseRollups(raw.length)) {
    const period = rollupPeriodFor(range);
    const buckets = await loadRollupBuckets(profileId, typeId, start, period);
    const series = rollupSeries(buckets, period);
    if (series.points.length > 0) return series;
    // No rollups for this metric — fall back to evenly sampled raw points.
    const sampled = downsampleEven(raw, MAX_RAW_POINTS);
    const fallback = rawSeries(sampled);
    return {
      ...fallback,
      caption: `Sampled ${sampled.length.toLocaleString("en-IN")} of ${raw.length.toLocaleString("en-IN")} readings`,
    };
  }
  return rawSeries(raw);
}

export type MetricHistoryRow = {
  id: string;
  observedAt: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: string;
  source: string;
  documentId: string | null;
  documentName: string | null;
};

export type MetricDetail = {
  type: {
    id: string;
    canonicalName: string;
    category: string;
    categoryLabel: string;
    unit: string | null;
    description: string | null;
  };
  range: RangeKey;
  series: MetricSeries;
  stats: {
    latest: number;
    latestDate: string;
    unit: string | null;
    min: number;
    max: number;
    trend: "rising" | "falling" | "flat" | null;
  } | null;
  history: MetricHistoryRow[];
  historyTotal: number;
  markers: Marker[];
};

const HISTORY_LIMIT = 200;

export async function getMetricDetail(
  profileId: string,
  typeId: string,
  range: RangeKey
): Promise<MetricDetail | null> {
  const type = await db.query.observationTypes.findFirst({
    where: eq(schema.observationTypes.id, typeId),
  });
  if (!type) return null;

  const start = rangeStart(range);
  const series = await loadMetricSeries(profileId, typeId, range);

  const historyConditions = [
    eq(schema.observations.profileId, profileId),
    eq(schema.observations.observationTypeId, typeId),
    eq(schema.observations.status, "confirmed"),
  ];
  if (start) historyConditions.push(gte(schema.observations.observedAt, start));

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.observations)
    .where(and(...historyConditions))) as Array<{ total: number }>;

  const historyRows = await db
    .select({
      id: schema.observations.id,
      observedAt: schema.observations.observedAt,
      valueNumeric: schema.observations.valueNumeric,
      valueText: schema.observations.valueText,
      unit: schema.observations.unit,
      referenceLow: schema.observations.referenceLow,
      referenceHigh: schema.observations.referenceHigh,
      interpretation: schema.observations.interpretation,
      source: schema.observations.source,
      documentId: schema.observations.documentId,
      documentName: schema.documents.originalFilename,
    })
    .from(schema.observations)
    .leftJoin(schema.documents, eq(schema.observations.documentId, schema.documents.id))
    .where(and(...historyConditions))
    .orderBy(desc(schema.observations.observedAt))
    .limit(HISTORY_LIMIT);

  const numericPoints = series.points.map((p) => p.value);
  const latestHistory = historyRows.find((r) => r.valueNumeric != null);
  const stats =
    latestHistory && numericPoints.length > 0
      ? {
          latest: latestHistory.valueNumeric!,
          latestDate: latestHistory.observedAt.toISOString(),
          unit: latestHistory.unit ?? type.normalUnit,
          min: Math.min(...numericPoints),
          max: Math.max(...numericPoints),
          trend: trendOf(numericPoints),
        }
      : null;

  return {
    type: {
      id: type.id,
      canonicalName: type.canonicalName,
      category: type.category,
      categoryLabel: categoryLabel(type.category),
      unit: type.normalUnit,
      description: type.description,
    },
    range,
    series,
    stats,
    history: historyRows.map((r) => ({ ...r, observedAt: r.observedAt.toISOString() })),
    historyTotal: total,
    markers: await getMarkers(profileId, start),
  };
}
