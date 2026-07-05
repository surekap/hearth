import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Records a medication event and refreshes the profile's quick-log recents.
 * Used by manual logging, quick log, and accepted prescription extractions.
 */
export async function recordMedicationEvent(input: {
  profileId: string;
  nameText: string;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  eventType?:
    | "prescribed"
    | "started"
    | "stopped"
    | "intake_logged"
    | "skipped"
    | "dose_changed";
  eventTime?: Date;
  documentId?: string | null;
  notes?: string | null;
  medicationMasterId?: string | null;
}) {
  const [event] = await db
    .insert(schema.medicationEvents)
    .values({
      profileId: input.profileId,
      medicationMasterId: input.medicationMasterId ?? null,
      nameText: input.nameText,
      dose: input.dose ?? null,
      route: input.route ?? null,
      frequency: input.frequency ?? null,
      eventType: input.eventType ?? "intake_logged",
      eventTime: input.eventTime ?? new Date(),
      documentId: input.documentId ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  await db
    .insert(schema.recentMedications)
    .values({
      profileId: input.profileId,
      medicationMasterId: input.medicationMasterId ?? null,
      nameText: input.nameText,
      dose: input.dose ?? null,
      frequency: input.frequency ?? null,
      lastUsedAt: event.eventTime,
      useCount: 1,
    })
    .onConflictDoUpdate({
      target: [schema.recentMedications.profileId, schema.recentMedications.nameText],
      set: {
        lastUsedAt: event.eventTime,
        useCount: sql`${schema.recentMedications.useCount} + 1`,
        dose: input.dose ?? sql`${schema.recentMedications.dose}`,
        frequency: input.frequency ?? sql`${schema.recentMedications.frequency}`,
      },
    });

  return event;
}

/**
 * Grows the internal medication dictionary (spec 13: no scraping — build our
 * own over time). Reuses an existing entry when the name already exists.
 */
export async function upsertMedicationMaster(input: {
  brandName?: string | null;
  genericName?: string | null;
  strength?: string | null;
  source: string;
}) {
  const name = input.brandName ?? input.genericName;
  if (!name) return null;

  const existing = await db.query.medicationMaster.findFirst({
    where: (m, { or, ilike }) =>
      or(ilike(m.brandName, name), ilike(m.genericName, name)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(schema.medicationMaster)
    .values({
      brandName: input.brandName ?? null,
      genericName: input.genericName ?? null,
      strength: input.strength ?? null,
      source: input.source,
    })
    .returning();
  return created;
}
