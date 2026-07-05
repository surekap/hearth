import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

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
        category: schema.observationTypes.category,
      })
      .from(schema.healthRollups)
      .innerJoin(
        schema.observationTypes,
        eq(schema.healthRollups.observationTypeId, schema.observationTypes.id)
      )
      .where(eq(schema.healthRollups.profileId, profileId))
      .orderBy(desc(schema.healthRollups.periodStart)),
  ]);

  // Exports only include confirmed clinical data.
  const confirmed = observations.filter((o) => o.status === "confirmed");
  return {
    profile,
    observations: confirmed,
    documents,
    reports,
    medEvents,
    recentMeds,
    healthImports,
    healthEvents,
    healthRollups,
  };
}

export type ProfileBundle = Awaited<ReturnType<typeof loadProfileBundle>>;
