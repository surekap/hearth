import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getMarkers, type Marker } from "./markers";
import { getClinicalAttentionIndex, getMetricIndex, type MetricIndexRow } from "./metric";
import { attentionState, formatMetricDisplay } from "./series";
import { metricBelongsTo, selectSystemHero, SYSTEMS, type SystemMedia } from "./systems";
import {
  buildClinicalImportBatches,
  type ClinicalImportBatch,
} from "./clinical-imports";

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
  recentClinicalImports: ClinicalImportBatch[];
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
  const [index, clinicalAbnormal] = await Promise.all([
    getMetricIndex(profileId),
    getClinicalAttentionIndex(profileId),
  ]);

  const attention: MetricIndexRow[] = [];
  let historicalCount = 0;
  for (const row of clinicalAbnormal) {
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
    const heroRow = selectSystemHero(def, members);
    const memberTypeIds = new Set(members.map((member) => member.typeId));
    const anyAttention = attention.some(
      (metric) => memberTypeIds.has(metric.typeId)
    );
    systems.push({
      id: def.id,
      title: def.title,
      eyebrow: def.eyebrow,
      media: def.media,
      tone: anyAttention ? "danger" : heroRow ? "success" : "neutral",
      memberCount: members.length,
      hero: heroRow
        ? {
            name: heroRow.name,
            value: formatMetricDisplay(heroRow.latestValue, heroRow.latestText, heroRow.unit),
          }
        : null,
    });
  }

  const reports = await db.query.clinicalReports.findMany({
    where: eq(schema.clinicalReports.profileId, profileId),
    orderBy: [desc(schema.clinicalReports.createdAt)],
    limit: 200,
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
  const recentDocuments = await db.query.documents.findMany({
    where: and(
      eq(schema.documents.profileId, profileId),
      eq(schema.documents.extractionStatus, "confirmed")
    ),
    orderBy: [desc(schema.documents.uploadedAt)],
    limit: 50,
    columns: {
      id: true,
      originalFilename: true,
      documentDate: true,
      uploadedAt: true,
    },
  });
  const documentIds = recentDocuments.map((document) => document.id);
  const [importObservations, importImages] =
    documentIds.length > 0
      ? await Promise.all([
          db
            .select({
              documentId: schema.observations.documentId,
              observedAt: schema.observations.observedAt,
              createdAt: schema.observations.createdAt,
              name: schema.observationTypes.canonicalName,
              category: schema.observationTypes.category,
              valueNumeric: schema.observations.valueNumeric,
              valueText: schema.observations.valueText,
              unit: schema.observations.unit,
              interpretation: schema.observations.interpretation,
              kind: sql<string | null>`${schema.observations.metadataJson}->>'kind'`,
            })
            .from(schema.observations)
            .innerJoin(
              schema.observationTypes,
              eq(schema.observations.observationTypeId, schema.observationTypes.id)
            )
            .where(
              and(
                eq(schema.observations.profileId, profileId),
                eq(schema.observations.status, "confirmed"),
                inArray(schema.observations.documentId, documentIds)
              )
            )
            .limit(5000),
          db.query.clinicalImages.findMany({
            where: and(
              eq(schema.clinicalImages.profileId, profileId),
              eq(schema.clinicalImages.status, "accepted"),
              inArray(schema.clinicalImages.documentId, documentIds)
            ),
            columns: {
              documentId: true,
              reportDate: true,
              createdAt: true,
            },
            limit: 1000,
          }),
        ])
      : [[], []];
  const recentClinicalImports = buildClinicalImportBatches({
    documents: recentDocuments.map((document) => ({
      id: document.id,
      filename: document.originalFilename,
      documentDate: document.documentDate,
      uploadedAt: document.uploadedAt,
    })),
    observations: importObservations
      .filter((observation) => observation.documentId != null)
      .map((observation) => ({ ...observation, documentId: observation.documentId! })),
    reports: reports
      .filter((report) => documentIds.includes(report.documentId))
      .map((report) => ({
        documentId: report.documentId,
        reportDate: report.reportDate,
        createdAt: report.createdAt,
        studyName: report.studyName,
        reportType: report.reportType,
      })),
    images: importImages,
  });

  return {
    attention: attention.slice(0, 8),
    historicalCount,
    systems,
    measurementCount: index.length,
    careAreas: [...careMap.values()].sort((a, b) =>
      (b.latestDate ?? "").localeCompare(a.latestDate ?? "")
    ),
    recentClinicalImports,
    recentMarkers: markers.slice(-8).reverse(),
  };
}
