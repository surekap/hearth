import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getMarkers, type Marker } from "./markers";
import {
  getClinicalAttentionIndex,
  getMetricIndex,
  loadMetricSeries,
  type MetricIndexRow,
} from "./metric";
import {
  isImplausibleMetricObservation,
  normalizeMetricRecord,
} from "./normalization";
import {
  attentionState,
  formatMetricDisplay,
  rangeStart,
  type MetricSeries,
  type RangeKey,
} from "./series";
import {
  metricBelongsTo,
  selectSystemChartMetrics,
  selectSystemHero,
  systemFor,
  type SystemDef,
} from "./systems";

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
  recentImports: Array<{
    id: string;
    typeId: string;
    name: string;
    valueNumeric: number | null;
    valueText: string | null;
    unit: string | null;
    observedAt: string;
    importedAt: string;
    documentId: string;
    documentName: string;
  }>;
  genetics: Array<{ id: string; conditionName: string; riskLevel: string; summary: string | null }>;
  markers: Marker[];
};

const SPARK_POINTS = 12;
const KEY_CHART_LIMIT = 6;

async function loadSparks(
  profileId: string,
  members: Array<{ typeId: string; name: string; unit: string | null }>
) {
  const typeIds = members.map((member) => member.typeId);
  if (typeIds.length === 0) return new Map<string, number[]>();
  // Single text param cast to uuid[] — drizzle would expand a JS array into a
  // tuple, which Postgres cannot cast to an array type.
  const typeIdArray = `{${typeIds.join(",")}}`;
  const result = await db.execute(sql`
    select observation_type_id, value_numeric, unit from (
      select o.observation_type_id, o.observed_at, o.value_numeric, o.unit,
        row_number() over (partition by o.observation_type_id order by o.observed_at desc) as rn
      from observations o
      join observation_types ot on ot.id = o.observation_type_id
      where o.profile_id = ${profileId} and o.status = 'confirmed'
        and o.value_numeric is not null
        and not (
          ot.canonical_name in ('BMI', 'Body Fat Percentage', 'Height', 'Lean Body Mass', 'Weight')
          and o.value_numeric <= 0
        )
        and o.observation_type_id = any(${typeIdArray}::uuid[])
    ) t where rn <= ${SPARK_POINTS}
    order by observation_type_id, observed_at asc
  `);
  const memberMap = new Map(members.map((member) => [member.typeId, member]));
  const map = new Map<string, number[]>();
  for (const row of result.rows as Array<{ observation_type_id: string; value_numeric: number; unit: string | null }>) {
    const member = memberMap.get(row.observation_type_id);
    if (!member || isImplausibleMetricObservation(member.name, Number(row.value_numeric))) continue;
    const normalized = normalizeMetricRecord({
      metric: member.name,
      normalUnit: member.unit,
      unit: row.unit,
      valueNumeric: Number(row.value_numeric),
    });
    const list = map.get(row.observation_type_id) ?? [];
    if (normalized.valueNumeric != null) list.push(normalized.valueNumeric);
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

  const [index, clinicalAbnormal] = await Promise.all([
    getMetricIndex(profileId),
    getClinicalAttentionIndex(profileId),
  ]);
  const members = index.filter((row) =>
    metricBelongsTo(def, { category: row.category, name: row.name })
  );
  if (members.length === 0) return null;

  const sparks = await loadSparks(
    profileId,
    members.map((m) => ({ typeId: m.typeId, name: m.name, unit: m.unit }))
  );
  const metrics: SystemMetricRow[] = members
    .map((m) => ({
      ...m,
      spark: sparks.get(m.typeId) ?? [],
    }))
    .sort(
      (a, b) =>
        b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name)
    );

  const chartRows = selectSystemChartMetrics(def, members, KEY_CHART_LIMIT);
  const keyCharts = await Promise.all(
    chartRows.map(async (row) => ({
      typeId: row.typeId,
      name: row.name,
      unit: row.unit,
      series: await loadMetricSeries(profileId, row.typeId, range),
    }))
  );

  const recentImportRows = await db
    .select({
      id: schema.observations.id,
      typeId: schema.observations.observationTypeId,
      name: schema.observationTypes.canonicalName,
      valueNumeric: schema.observations.valueNumeric,
      valueText: schema.observations.valueText,
      unit: schema.observations.unit,
      observedAt: schema.observations.observedAt,
      importedAt: schema.observations.createdAt,
      documentId: schema.documents.id,
      documentName: schema.documents.originalFilename,
    })
    .from(schema.observations)
    .innerJoin(
      schema.observationTypes,
      eq(schema.observations.observationTypeId, schema.observationTypes.id)
    )
    .innerJoin(schema.documents, eq(schema.observations.documentId, schema.documents.id))
    .where(
      and(
        eq(schema.observations.profileId, profileId),
        eq(schema.observations.status, "confirmed"),
        inArray(
          schema.observations.observationTypeId,
          members.map((member) => member.typeId)
        )
      )
    )
    .orderBy(desc(schema.observations.createdAt))
    .limit(12);
  const recentImports = recentImportRows.map((row) => ({
    ...row,
    observedAt: row.observedAt.toISOString(),
    importedAt: row.importedAt.toISOString(),
  }));

  const heroRow = selectSystemHero(def, members);
  const hero = heroRow
    ? {
        name: heroRow.name,
        typeId: heroRow.typeId,
        value: formatMetricDisplay(heroRow.latestValue, heroRow.latestText, heroRow.unit),
      }
    : null;

  const memberTypeIds = new Set(members.map((member) => member.typeId));
  const anyAttention = clinicalAbnormal.some(
    (metric) =>
      memberTypeIds.has(metric.typeId) &&
      attentionState({
        interpretation: metric.interpretation,
        observedAt: new Date(metric.latestDate),
      }) === "attention"
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
    recentImports,
    genetics,
    markers: await getMarkers(profileId, rangeStart(range)),
  };
}
