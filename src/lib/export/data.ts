import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  isImplausibleMetricObservation,
  normalizeMetricRecord,
} from "@/lib/health/normalization";

/** Everything needed to export one profile, loaded profile-scoped in one place. */
export async function loadProfileBundle(profileId: string) {
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, profileId),
  });
  if (!profile) throw new Error("Profile not found");

  const [
    observations,
    documents,
    reports,
    medEvents,
    recentMeds,
    healthImports,
    healthEvents,
    healthRollups,
    geneticReports,
    geneticVariants,
    geneticRisks,
    pharmacogenomics,
  ] = await Promise.all([
    db
      .select({
        id: schema.observations.id,
        observedAt: schema.observations.observedAt,
        valueNumeric: schema.observations.valueNumeric,
        valueText: schema.observations.valueText,
        unit: schema.observations.unit,
        referenceLow: schema.observations.referenceLow,
        referenceHigh: schema.observations.referenceHigh,
        interpretation: schema.observations.interpretation,
        status: schema.observations.status,
        source: schema.observations.source,
        documentId: schema.observations.documentId,
        typeName: schema.observationTypes.canonicalName,
        normalUnit: schema.observationTypes.normalUnit,
        category: schema.observationTypes.category,
        loincCode: schema.observationTypes.loincCode,
      })
      .from(schema.observations)
      .innerJoin(
        schema.observationTypes,
        eq(schema.observations.observationTypeId, schema.observationTypes.id)
      )
      .where(eq(schema.observations.profileId, profileId))
      .orderBy(asc(schema.observations.observedAt)),
    db.query.documents.findMany({
      where: eq(schema.documents.profileId, profileId),
      orderBy: [desc(schema.documents.uploadedAt)],
    }),
    db.query.clinicalReports.findMany({
      where: eq(schema.clinicalReports.profileId, profileId),
      orderBy: [desc(schema.clinicalReports.createdAt)],
    }),
    db.query.medicationEvents.findMany({
      where: eq(schema.medicationEvents.profileId, profileId),
      orderBy: [desc(schema.medicationEvents.eventTime)],
    }),
    db.query.recentMedications.findMany({
      where: eq(schema.recentMedications.profileId, profileId),
      orderBy: [desc(schema.recentMedications.lastUsedAt)],
    }),
    db.query.healthImports.findMany({
      where: eq(schema.healthImports.profileId, profileId),
      orderBy: [desc(schema.healthImports.createdAt)],
    }),
    db.query.healthEvents.findMany({
      where: eq(schema.healthEvents.profileId, profileId),
      orderBy: [desc(schema.healthEvents.startAt)],
    }),
    db
      .select({
        id: schema.healthRollups.id,
        period: schema.healthRollups.period,
        periodStart: schema.healthRollups.periodStart,
        periodEnd: schema.healthRollups.periodEnd,
        valueNumeric: schema.healthRollups.valueNumeric,
        unit: schema.healthRollups.unit,
        aggregation: schema.healthRollups.aggregation,
        sourceObservationCount: schema.healthRollups.sourceObservationCount,
        typeName: schema.observationTypes.canonicalName,
        normalUnit: schema.observationTypes.normalUnit,
        category: schema.observationTypes.category,
      })
      .from(schema.healthRollups)
      .innerJoin(
        schema.observationTypes,
        eq(schema.healthRollups.observationTypeId, schema.observationTypes.id)
      )
      .where(eq(schema.healthRollups.profileId, profileId))
      .orderBy(desc(schema.healthRollups.periodStart)),
    db.query.geneticReports.findMany({
      where: eq(schema.geneticReports.profileId, profileId),
      orderBy: [desc(schema.geneticReports.reportDate)],
    }),
    db.query.geneticVariants.findMany({
      where: eq(schema.geneticVariants.profileId, profileId),
      orderBy: [desc(schema.geneticVariants.createdAt)],
    }),
    db.query.geneticRiskAssessments.findMany({
      where: eq(schema.geneticRiskAssessments.profileId, profileId),
      orderBy: [desc(schema.geneticRiskAssessments.createdAt)],
    }),
    db.query.pharmacogenomicResults.findMany({
      where: eq(schema.pharmacogenomicResults.profileId, profileId),
      orderBy: [desc(schema.pharmacogenomicResults.createdAt)],
    }),
  ]);

  // Exports only include confirmed clinical data.
  const confirmed = observations
    .filter((o) => o.status === "confirmed")
    .filter((o) => !isImplausibleMetricObservation(o.typeName, o.valueNumeric))
    .map((o) => {
      const normalized = normalizeMetricRecord({
        metric: o.typeName,
        normalUnit: o.normalUnit,
        unit: o.unit,
        valueNumeric: o.valueNumeric,
        referenceLow: o.referenceLow,
        referenceHigh: o.referenceHigh,
      });
      return {
        ...o,
        unit: normalized.unit,
        valueNumeric: normalized.valueNumeric,
        referenceLow: normalized.referenceLow,
        referenceHigh: normalized.referenceHigh,
      };
    });
  const normalizedRollups = healthRollups
    .filter((row) => !isImplausibleMetricObservation(row.typeName, row.valueNumeric))
    .map((row) => {
      const normalized = normalizeMetricRecord({
        metric: row.typeName,
        normalUnit: row.normalUnit,
        unit: row.unit,
        valueNumeric: row.valueNumeric,
      });
      return {
        ...row,
        unit: normalized.unit,
        valueNumeric: normalized.valueNumeric ?? row.valueNumeric,
      };
    });
  return {
    profile,
    observations: confirmed,
    documents,
    reports,
    medEvents,
    recentMeds,
    healthImports,
    healthEvents,
    healthRollups: normalizedRollups,
    geneticReports,
    geneticVariants,
    geneticRisks,
    pharmacogenomics,
  };
}

export type ProfileBundle = Awaited<ReturnType<typeof loadProfileBundle>>;
