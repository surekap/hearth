import { desc, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getMarkers, type Marker } from "./markers";
import { getMetricIndex, loadMetricSeries, type MetricIndexRow } from "./metric";
import {
  attentionState,
  formatMetricValue,
  rangeStart,
  type MetricSeries,
  type RangeKey,
} from "./series";
import { metricBelongsTo, systemFor, type SystemDef } from "./systems";

export type SystemMetricRow = MetricIndexRow & { spark: number[] };

export type SystemPageData = {
  def: SystemDef;
  range: RangeKey;
  tone: "danger" | "success" | "neutral";
  hero: { name: string; value: string; typeId: string } | null;
  keyCharts: Array<{ typeId: string; name: string; unit: string | null; series: MetricSeries }>;
  metrics: SystemMetricRow[];
  reports: Array<{
    id: string;
    documentId: string;
    specialty: string | null;
    reportType: string;
    reportDate: string | null;
    summary: string | null;
    followUpRecommended: boolean;
  }>;
  genetics: Array<{ id: string; conditionName: string; riskLevel: string; summary: string | null }>;
  markers: Marker[];
};

const SPARK_POINTS = 12;
const KEY_CHART_LIMIT = 6;

async function loadSparks(profileId: string, typeIds: string[]) {
  if (typeIds.length === 0) return new Map<string, number[]>();
  // Single text param cast to uuid[] — drizzle would expand a JS array into a
  // tuple, which Postgres cannot cast to an array type.
  const typeIdArray = `{${typeIds.join(",")}}`;
  const result = await db.execute(sql`
    select observation_type_id, value_numeric from (
      select o.observation_type_id, o.observed_at, o.value_numeric,
        row_number() over (partition by o.observation_type_id order by o.observed_at desc) as rn
      from observations o
      where o.profile_id = ${profileId} and o.status = 'confirmed'
        and o.value_numeric is not null
        and o.observation_type_id = any(${typeIdArray}::uuid[])
    ) t where rn <= ${SPARK_POINTS}
    order by observation_type_id, observed_at asc
  `);
  const map = new Map<string, number[]>();
  for (const row of result.rows as Array<{ observation_type_id: string; value_numeric: number }>) {
    const list = map.get(row.observation_type_id) ?? [];
    list.push(Number(row.value_numeric));
    map.set(row.observation_type_id, list);
  }
  return map;
}

export async function getSystemData(
  profileId: string,
  systemId: string,
  range: RangeKey
): Promise<SystemPageData | null> {
  const def = systemFor(systemId);
  if (!def) return null;

  const index = await getMetricIndex(profileId);
  const members = index.filter((row) =>
    metricBelongsTo(def, { category: row.category, name: row.name })
  );
  if (members.length === 0) return null;

  const sparks = await loadSparks(profileId, members.map((m) => m.typeId));
  const metrics: SystemMetricRow[] = members.map((m) => ({
    ...m,
    spark: sparks.get(m.typeId) ?? [],
  }));

  const byName = new Map(members.map((m) => [m.name, m]));
  const keyRows = def.keyMetrics
    .map((name) => byName.get(name))
    .filter(Boolean) as MetricIndexRow[];
  const chartRows = (keyRows.length > 0 ? keyRows : members.slice(0, KEY_CHART_LIMIT)).slice(
    0,
    KEY_CHART_LIMIT
  );
  const keyCharts = await Promise.all(
    chartRows.map(async (row) => ({
      typeId: row.typeId,
      name: row.name,
      unit: row.unit,
      series: await loadMetricSeries(profileId, row.typeId, range),
    }))
  );

  const heroRow =
    def.heroMetrics.map((name) => byName.get(name)).find((r) => r && r.latestValue != null) ??
    members.find((m) => m.latestValue != null) ??
    null;
  const hero = heroRow
    ? {
        name: heroRow.name,
        typeId: heroRow.typeId,
        value: formatMetricValue(heroRow.latestValue!, heroRow.unit),
      }
    : null;

  const anyAttention = members.some(
    (m) =>
      attentionState({ interpretation: m.interpretation, observedAt: new Date(m.latestDate) }) ===
      "attention"
  );
  const tone: SystemPageData["tone"] = anyAttention ? "danger" : hero ? "success" : "neutral";

  const reports =
    def.reportTerms.length > 0
      ? await db
          .select({
            id: schema.clinicalReports.id,
            documentId: schema.clinicalReports.documentId,
            specialty: schema.clinicalReports.specialty,
            reportType: schema.clinicalReports.reportType,
            reportDate: schema.clinicalReports.reportDate,
            summary: schema.clinicalReports.summary,
            followUpRecommended: schema.clinicalReports.followUpRecommended,
          })
          .from(schema.clinicalReports)
          .where(
            sql`${schema.clinicalReports.profileId} = ${profileId} and (${or(
              ...def.reportTerms.map((t) => ilike(schema.clinicalReports.specialty, `%${t}%`))
            )})`
          )
          .orderBy(desc(schema.clinicalReports.createdAt))
          .limit(10)
      : [];

  const genetics =
    def.geneticTerms.length > 0
      ? await db
          .select({
            id: schema.geneticRiskAssessments.id,
            conditionName: schema.geneticRiskAssessments.conditionName,
            riskLevel: schema.geneticRiskAssessments.riskLevel,
            summary: schema.geneticRiskAssessments.summary,
          })
          .from(schema.geneticRiskAssessments)
          .where(
            sql`${schema.geneticRiskAssessments.profileId} = ${profileId} and (${or(
              ...def.geneticTerms.map((t) =>
                ilike(schema.geneticRiskAssessments.conditionName, `%${t}%`)
              )
            )}) and ${schema.geneticRiskAssessments.riskLevel} in ('high', 'medium')`
          )
          .orderBy(desc(schema.geneticRiskAssessments.riskLevel))
          .limit(8)
      : [];

  return {
    def,
    range,
    tone,
    hero,
    keyCharts,
    metrics,
    reports,
    genetics,
    markers: await getMarkers(profileId, rangeStart(range)),
  };
}
