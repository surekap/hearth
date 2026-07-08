import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getMarkers, type Marker } from "./markers";
import { getMetricIndex, type MetricIndexRow } from "./metric";
import { attentionState, formatMetricValue } from "./series";
import { metricBelongsTo, SYSTEMS, type SystemMedia } from "./systems";

export type OverviewSystemCard = {
  id: string;
  title: string;
  eyebrow: string;
  media?: SystemMedia;
  tone: "danger" | "success" | "neutral";
  memberCount: number;
  hero: { name: string; value: string } | null;
};

export type OverviewCareArea = {
  key: string;
  label: string;
  count: number;
  followUpCount: number;
  latestDate: string | null;
};

export type OverviewData = {
  attention: MetricIndexRow[];
  historicalCount: number;
  systems: OverviewSystemCard[];
  measurementCount: number;
  careAreas: OverviewCareArea[];
  recentMarkers: Marker[];
};

function titleize(input: string) {
  return input
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export async function getOverviewData(profileId: string): Promise<OverviewData> {
  const index = await getMetricIndex(profileId);

  const attention: MetricIndexRow[] = [];
  let historicalCount = 0;
  for (const row of index) {
    const state = attentionState({
      interpretation: row.interpretation,
      observedAt: new Date(row.latestDate),
    });
    if (state === "attention") attention.push(row);
    else if (state === "historical") historicalCount += 1;
  }
  attention.sort((a, b) => {
    const aCrit = a.interpretation === "critical" ? 0 : 1;
    const bCrit = b.interpretation === "critical" ? 0 : 1;
    if (aCrit !== bCrit) return aCrit - bCrit;
    return b.latestDate.localeCompare(a.latestDate);
  });

  const systems: OverviewSystemCard[] = [];
  for (const def of SYSTEMS) {
    const members = index.filter((row) =>
      metricBelongsTo(def, { category: row.category, name: row.name })
    );
    if (members.length === 0) continue;
    const byName = new Map(members.map((m) => [m.name, m]));
    const heroRow =
      def.heroMetrics.map((n) => byName.get(n)).find((r) => r && r.latestValue != null) ??
      members.find((m) => m.latestValue != null) ??
      null;
    const anyAttention = members.some(
      (m) =>
        attentionState({
          interpretation: m.interpretation,
          observedAt: new Date(m.latestDate),
        }) === "attention"
    );
    systems.push({
      id: def.id,
      title: def.title,
      eyebrow: def.eyebrow,
      media: def.media,
      tone: anyAttention ? "danger" : heroRow ? "success" : "neutral",
      memberCount: members.length,
      hero: heroRow
        ? { name: heroRow.name, value: formatMetricValue(heroRow.latestValue!, heroRow.unit) }
        : null,
    });
  }

  const reports = await db.query.clinicalReports.findMany({
    where: eq(schema.clinicalReports.profileId, profileId),
    orderBy: [desc(schema.clinicalReports.createdAt)],
    limit: 50,
  });
  const careMap = new Map<string, OverviewCareArea>();
  for (const report of reports) {
    const key = (report.specialty ?? report.reportType ?? "other").toLowerCase();
    const date = report.reportDate
      ? new Date(report.reportDate).toISOString()
      : report.createdAt.toISOString();
    const existing = careMap.get(key);
    if (!existing) {
      careMap.set(key, {
        key,
        label: report.specialty ? titleize(report.specialty) : titleize(report.reportType),
        count: 1,
        followUpCount: report.followUpRecommended ? 1 : 0,
        latestDate: date,
      });
    } else {
      existing.count += 1;
      if (report.followUpRecommended) existing.followUpCount += 1;
      if (!existing.latestDate || date > existing.latestDate) existing.latestDate = date;
    }
  }

  const markers = await getMarkers(profileId, null);

  return {
    attention: attention.slice(0, 8),
    historicalCount,
    systems,
    measurementCount: index.length,
    careAreas: [...careMap.values()].sort((a, b) =>
      (b.latestDate ?? "").localeCompare(a.latestDate ?? "")
    ),
    recentMarkers: markers.slice(-8).reverse(),
  };
}
