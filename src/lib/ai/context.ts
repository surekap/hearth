import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { redactDeep } from "./redact";

export type AiContext = {
  profile: {
    // Identified only by relationship + demographics, never by name.
    relationship: string;
    ageYears: number | null;
    sexAtBirth: string;
  };
  observations: Array<{
    test: string;
    category: string;
    date: string;
    value: number | string | null;
    unit: string | null;
    referenceLow: number | null;
    referenceHigh: number | null;
    interpretation: string;
  }>;
  reports: Array<{
    date: string | null;
    type: string;
    specialty: string | null;
    summary: string | null;
    impression: string | null;
  }>;
  /** Self-reported in past AI conversations — history-taking notes, not lab facts. */
  patientReported: Array<{
    kind: string;
    label: string;
    detail: string | null;
    severity: string | null;
    notedAt: string;
  }>;
  /** Keyword-matched excerpts of original report text, when relevant. */
  documentSnippets?: Array<{ document: string; date: string | null; snippet: string }>;
  timeRange: { from: string | null; to: string | null };
};

/**
 * Profile isolation happens HERE, before any retrieval: only confirmed
 * observations and reports belonging to the given profile are loaded.
 */
export async function buildAiContext(
  profileId: string,
  knownNames: string[]
): Promise<AiContext> {
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, profileId),
  });
  if (!profile) throw new Error("Profile not found");

  const rows = await db
    .select({
      observedAt: schema.observations.observedAt,
      valueNumeric: schema.observations.valueNumeric,
      valueText: schema.observations.valueText,
      unit: schema.observations.unit,
      referenceLow: schema.observations.referenceLow,
      referenceHigh: schema.observations.referenceHigh,
      interpretation: schema.observations.interpretation,
      typeName: schema.observationTypes.canonicalName,
      category: schema.observationTypes.category,
    })
    .from(schema.observations)
    .innerJoin(
      schema.observationTypes,
      eq(schema.observations.observationTypeId, schema.observationTypes.id)
    )
    .where(
      and(
        eq(schema.observations.profileId, profileId),
        eq(schema.observations.status, "confirmed")
      )
    )
    .orderBy(asc(schema.observations.observedAt))
    .limit(500);

  const reports = await db.query.clinicalReports.findMany({
    where: eq(schema.clinicalReports.profileId, profileId),
    orderBy: [asc(schema.clinicalReports.createdAt)],
    limit: 50,
  });

  const reported = await db.query.conversationDatapoints.findMany({
    where: eq(schema.conversationDatapoints.profileId, profileId),
    orderBy: (d, { desc }) => [desc(d.notedAt)],
    limit: 30,
  });

  const ageYears = profile.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000)
      )
    : null;

  const context: AiContext = {
    profile: {
      relationship: profile.relationship,
      ageYears,
      sexAtBirth: profile.sexAtBirth,
    },
    observations: rows.map((r) => ({
      test: r.typeName,
      category: r.category,
      date: r.observedAt.toISOString().slice(0, 10),
      value: r.valueNumeric ?? r.valueText,
      unit: r.unit,
      referenceLow: r.referenceLow,
      referenceHigh: r.referenceHigh,
      interpretation: r.interpretation,
    })),
    reports: reports.map((r) => ({
      date: r.reportDate,
      type: r.reportType,
      specialty: r.specialty,
      summary: r.summary,
      impression: r.impression,
    })),
    patientReported: reported.map((d) => ({
      kind: d.kind,
      label: d.label,
      detail: d.detail,
      severity: d.severity,
      notedAt: d.notedAt.toISOString().slice(0, 10),
    })),
    timeRange: {
      from: rows[0]?.observedAt.toISOString().slice(0, 10) ?? null,
      to: rows[rows.length - 1]?.observedAt.toISOString().slice(0, 10) ?? null,
    },
  };

  // Redact PII from every string (report summaries may contain names).
  return redactDeep(context, knownNames);
}
