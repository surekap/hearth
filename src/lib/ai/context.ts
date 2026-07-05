import { and, asc, desc, eq } from "drizzle-orm";
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
  healthRollups: Array<{
    metric: string;
    category: string;
    period: string;
    periodStart: string;
    periodEnd: string;
    value: number;
    unit: string | null;
    aggregation: string;
    sourceObservationCount: number;
  }>;
  healthEvents: Array<{
    type: string;
    label: string;
    start: string;
    end: string | null;
    source: string;
  }>;
  genomics: {
    reports: Array<{
      id: string;
      vendor: string | null;
      reportName: string | null;
      reportDate: string | null;
      testKind: string;
      summary: string | null;
    }>;
    risks: Array<{
      category: string;
      condition: string;
      assessment: string | null;
      riskLevel: string;
      lifetimeRiskPercent: number | null;
      populationRiskPercent: number | null;
      variantScore: string | null;
    }>;
    pharmacogenomics: Array<{
      drug: string;
      gene: string | null;
      genotype: string | null;
      phenotype: string | null;
      implication: string;
      actionability: string;
      recommendationSummary: string | null;
    }>;
  };
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

  const rowsDesc = await db
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
    .orderBy(desc(schema.observations.observedAt))
    .limit(500);
  const rows = rowsDesc.reverse();

  const rollupsDesc = await db
    .select({
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
    .orderBy(desc(schema.healthRollups.periodStart))
    .limit(300);
  const rollups = rollupsDesc.reverse();

  const reports = await db.query.clinicalReports.findMany({
    where: eq(schema.clinicalReports.profileId, profileId),
    orderBy: [asc(schema.clinicalReports.createdAt)],
    limit: 50,
  });

  const eventsDesc = await db.query.healthEvents.findMany({
    where: eq(schema.healthEvents.profileId, profileId),
    orderBy: [desc(schema.healthEvents.startAt)],
    limit: 100,
  });
  const events = eventsDesc.reverse();

  const [geneticReports, geneticRisks, pharmacogenomics] = await Promise.all([
    db.query.geneticReports.findMany({
      where: eq(schema.geneticReports.profileId, profileId),
      orderBy: [asc(schema.geneticReports.reportDate)],
      limit: 20,
    }),
    db.query.geneticRiskAssessments.findMany({
      where: eq(schema.geneticRiskAssessments.profileId, profileId),
      orderBy: [asc(schema.geneticRiskAssessments.createdAt)],
      limit: 100,
    }),
    db.query.pharmacogenomicResults.findMany({
      where: eq(schema.pharmacogenomicResults.profileId, profileId),
      orderBy: [asc(schema.pharmacogenomicResults.createdAt)],
      limit: 100,
    }),
  ]);

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
    healthRollups: rollups.map((r) => ({
      metric: r.typeName,
      category: r.category,
      period: r.period,
      periodStart: r.periodStart.toISOString().slice(0, 10),
      periodEnd: r.periodEnd.toISOString().slice(0, 10),
      value: r.valueNumeric,
      unit: r.unit,
      aggregation: r.aggregation,
      sourceObservationCount: r.sourceObservationCount,
    })),
    healthEvents: events.map((e) => ({
      type: e.eventType,
      label: e.label,
      start: e.startAt.toISOString(),
      end: e.endAt?.toISOString() ?? null,
      source: e.source,
    })),
    genomics: {
      reports: geneticReports.map((r) => ({
        id: r.id,
        vendor: r.vendor,
        reportName: r.reportName,
        reportDate: r.reportDate,
        testKind: r.testKind,
        summary: r.summary,
      })),
      risks: geneticRisks.map((r) => ({
        category: r.category,
        condition: r.conditionName,
        assessment: r.assessment,
        riskLevel: r.riskLevel,
        lifetimeRiskPercent: r.lifetimeRiskPercent,
        populationRiskPercent: r.populationRiskPercent,
        variantScore: r.variantScore,
      })),
      pharmacogenomics: pharmacogenomics.map((p) => ({
        drug: p.drugName,
        gene: p.gene,
        genotype: p.genotype,
        phenotype: p.phenotype,
        implication: p.implication,
        actionability: p.actionability,
        recommendationSummary: p.recommendationSummary,
      })),
    },
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
