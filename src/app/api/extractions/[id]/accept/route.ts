import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { scheduleInsightRefresh } from "@/lib/ai/insights";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError, logAudit } from "@/lib/api";
import {
  buildCanonicalMap,
  resolveObservationType,
  computeInterpretation,
  normalizeObservationName,
  type ObservationTypeRow,
} from "@/lib/extraction/canonical";
import { normalizeConditionName } from "@/lib/extraction/schemas";
import { normalizeMetricRecord } from "@/lib/health/normalization";
import { derivePrescriptionCourse } from "@/lib/medication-course";
import { recordMedicationEvent, upsertMedicationMaster } from "@/lib/medications";

const bodySchema = z.object({
  acceptItemIds: z.array(z.string().uuid()),
  rejectItemIds: z.array(z.string().uuid()).default([]),
  createMissingObservationTypes: z.boolean().default(false),
});

// Item types the write loop below can turn into confirmed records. Keep in sync
// with the branches in POST — `procedure` is deliberately absent because it has
// no destination table yet.
const ACCEPTABLE_ITEM_TYPES = new Set<
  (typeof schema.extractedItemTypeEnum.enumValues)[number]
>([
  "lab_observation",
  "diagnostic_measurement",
  "diagnosis",
  "report_summary",
  "medication",
  "genetic_variant",
  "genetic_risk",
  "genetic_trait",
  "pharmacogenomic_result",
]);

type LabRaw = {
  test_name?: string;
  canonical_name?: string | null;
  observation_type_id?: string | null;
  value?: number | null;
  value_text?: string | null;
  unit?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  interpretation?: "low" | "normal" | "high" | "critical" | "unknown";
  report_date?: string | null;
  confidence?: number;
  category?: (typeof schema.observationCategoryEnum.enumValues)[number];
  page_number?: number | null;
  study_name?: string | null;
  report_type?: string | null;
  modality?: string | null;
  page_start?: number | null;
  page_end?: number | null;
};

type DiagnosisRaw = {
  condition_name?: string;
  category?: (typeof schema.diagnosisCategoryEnum.enumValues)[number];
  clinical_status?: (typeof schema.diagnosisClinicalStatusEnum.enumValues)[number];
  certainty?: (typeof schema.diagnosisCertaintyEnum.enumValues)[number];
  severity?: string | null;
  body_site?: string | null;
  icd10_code?: string | null;
  onset_date?: string | null;
  recorded_date?: string | null;
  doctor_name?: string | null;
  note?: string | null;
  page_number?: number | null;
  confidence?: number;
};

const blockedDynamicTestNames = new Set([
  "allergy panel",
  "biological reference interval",
  "biological reference intervals",
  "contact",
  "drugs",
  "food",
  "inhalants",
  "method",
  "nonveg",
  "observed values",
  "parameter",
  "result",
  "sample type",
  "serology",
  "test description",
  "test name",
  "units",
  "value",
]);

function cleanTestName(name: string | null | undefined): string | null {
  const cleaned = name
    ?.replace(/^[#\s:|.-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function looksLikeAllergenSpecificIge(raw: LabRaw): boolean {
  const name = `${raw.test_name ?? ""} ${raw.canonical_name ?? ""}`;
  const unit = raw.unit?.toLowerCase().replace(/\s+/g, "") ?? "";
  return (
    /\bige\b/i.test(name) ||
    (/kua\/?l|iu\/?ml|u\/?l/.test(unit) &&
      raw.reference_high != null &&
      raw.reference_high <= 0.35)
  );
}

function inferredCanonicalCandidates(raw: LabRaw): string[] {
  const names = [cleanTestName(raw.canonical_name), cleanTestName(raw.test_name)].filter(
    (name): name is string => !!name
  );
  const candidates = [...names];
  if (looksLikeAllergenSpecificIge(raw)) {
    for (const name of names) {
      if (!/\bige\b/i.test(name)) candidates.push(`${name} IgE`);
    }
  }
  return candidates;
}

function dynamicObservationName(raw: LabRaw): string | null {
  const base = cleanTestName(raw.canonical_name) ?? cleanTestName(raw.test_name);
  if (!base) return null;

  const normalized = normalizeObservationName(base);
  if (
    normalized.length < 3 ||
    !/[a-z]/.test(normalized) ||
    blockedDynamicTestNames.has(normalized)
  ) {
    return null;
  }

  if (looksLikeAllergenSpecificIge(raw) && !/\bige\b/i.test(base)) {
    return `${base} IgE`;
  }
  return base;
}

function inferObservationCategory(
  raw: LabRaw
): (typeof schema.observationCategoryEnum.enumValues)[number] {
  if (raw.category && schema.observationCategoryEnum.enumValues.includes(raw.category)) {
    return raw.category;
  }
  if (looksLikeAllergenSpecificIge(raw)) return "allergy";

  const name = `${raw.test_name ?? ""} ${raw.canonical_name ?? ""}`.toLowerCase();
  const unit = raw.unit?.toLowerCase() ?? "";
  if (name.includes("urine") || unit.includes("hpf") || unit.includes("lpf")) return "urine";
  return "other";
}

function addTypeToCanonicalMap(
  map: Map<string, ObservationTypeRow>,
  type: ObservationTypeRow,
  aliases: string[] = []
) {
  map.set(normalizeObservationName(type.canonicalName), type);
  for (const alias of [...type.aliases, ...aliases]) {
    map.set(normalizeObservationName(alias), type);
  }
}

async function createValidatedObservationType({
  raw,
  canonicalMap,
  documentName,
}: {
  raw: LabRaw;
  canonicalMap: Map<string, ObservationTypeRow>;
  documentName: string;
}): Promise<ObservationTypeRow | null> {
  const canonicalName = dynamicObservationName(raw);
  if (!canonicalName) return null;

  const aliases = Array.from(
    new Set(
      [cleanTestName(raw.test_name), cleanTestName(raw.canonical_name)]
        .filter(
          (name): name is string =>
            !!name &&
            normalizeObservationName(name) !== normalizeObservationName(canonicalName)
        )
    )
  );

  const existing = resolveObservationType(canonicalMap, [canonicalName, ...aliases]);
  if (existing) return existing;

  const [created] = await db
    .insert(schema.observationTypes)
    .values({
      canonicalName,
      aliases,
      category: inferObservationCategory(raw),
      normalUnit: raw.unit ?? null,
      description: `Created from a user-validated extraction in ${documentName}.`,
    })
    .returning();

  addTypeToCanonicalMap(canonicalMap, created, aliases);
  return created;
}

type GeneticReportMeta = {
  vendor?: string | null;
  report_name?: string | null;
  test_kind?: "predisposition" | "pharmacogenomics" | "carrier" | "raw_genotype" | "other" | null;
  genome_build?: string | null;
  summary?: string | null;
};

type GeneticBaseRaw = {
  genetic_report?: GeneticReportMeta | null;
  report_date?: string | null;
  confidence?: number;
};

type GeneticVariantRaw = GeneticBaseRaw & {
  gene?: string | null;
  variant_id?: string | null;
  marker?: string | null;
  chromosome?: string | null;
  position?: string | null;
  genotype?: string | null;
  phenotype?: string | null;
  source_section?: string | null;
};

type GeneticRiskRaw = GeneticBaseRaw & {
  category?: "disease" | "trait";
  condition_name?: string;
  assessment?: string | null;
  risk_level?: "low" | "normal" | "medium" | "high" | "unknown";
  lifetime_risk_percent?: number | null;
  population_risk_percent?: number | null;
  variant_score?: string | null;
  summary?: string | null;
};

type PharmacogenomicRaw = GeneticBaseRaw & {
  drug_name?: string;
  gene?: string | null;
  genotype?: string | null;
  phenotype?: string | null;
  implication?: string;
  actionability?: "informational" | "actionable" | "high_impact" | "unknown";
  recommendation_summary?: string | null;
  evidence_level?: string | null;
};

async function ensureGeneticReport({
  profileId,
  documentId,
  documentDate,
  uploadedAt,
  raw,
}: {
  profileId: string;
  documentId: string;
  documentDate: string | null;
  uploadedAt: Date;
  raw: GeneticBaseRaw;
}) {
  const existing = await db.query.geneticReports.findFirst({
    where: and(
      eq(schema.geneticReports.profileId, profileId),
      eq(schema.geneticReports.documentId, documentId)
    ),
  });
  if (existing) return existing;

  const meta = raw.genetic_report;
  const reportDate = raw.report_date ?? documentDate ?? uploadedAt.toISOString().slice(0, 10);
  const [created] = await db
    .insert(schema.geneticReports)
    .values({
      profileId,
      documentId,
      vendor: meta?.vendor ?? null,
      reportName: meta?.report_name ?? null,
      reportDate,
      testKind: meta?.test_kind ?? "other",
      genomeBuild: meta?.genome_build ?? null,
      summary: meta?.summary ?? null,
    })
    .returning();
  return created;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await requireUser();

    const job = await db.query.extractionJobs.findFirst({
      where: eq(schema.extractionJobs.id, id),
    });
    if (!job) throw new ApiError(404, "Extraction not found");
    await requireProfile(userId, job.profileId);

    const doc = await db.query.documents.findFirst({
      where: eq(schema.documents.id, job.documentId),
    });
    if (!doc) throw new ApiError(404, "Document not found");

    // Re-extracting a document leaves the previous job's un-actioned drafts behind.
    // They are invisible in the UI (review renders the latest job only) but were
    // still acceptable by id, which would write stale extraction output into
    // confirmed records. Only the current job for a document may be accepted.
    const latestJob = await db.query.extractionJobs.findFirst({
      where: eq(schema.extractionJobs.documentId, doc.id),
      orderBy: [desc(schema.extractionJobs.createdAt)],
      columns: { id: true },
    });
    if (latestJob && latestJob.id !== job.id) {
      throw new ApiError(
        409,
        "This extraction has been superseded by a newer one for the same document. Review the current extraction instead."
      );
    }

    const body = bodySchema.parse(await req.json());
    const allIds = [...body.acceptItemIds, ...body.rejectItemIds];
    const items = allIds.length
      ? await db.query.extractedItems.findMany({
          where: and(
            eq(schema.extractedItems.extractionJobId, job.id),
            inArray(schema.extractedItems.id, allIds)
          ),
        })
      : [];

    // Every accepted item type must have a branch in the write loop below. Without
    // this guard an unhandled type is marked `accepted` and written nowhere, so the
    // user sees a success and silently loses the data. Validated before any writes
    // so a bad batch fails whole rather than half-applied.
    const unhandled = [
      ...new Set(
        items
          .filter(
            (item) =>
              body.acceptItemIds.includes(item.id) &&
              item.status !== "accepted" &&
              !ACCEPTABLE_ITEM_TYPES.has(item.itemType)
          )
          .map((item) => item.itemType)
      ),
    ];
    if (unhandled.length > 0) {
      throw new ApiError(
        422,
        `Cannot accept unsupported item type(s): ${unhandled.join(", ")}. ` +
          `These items have no confirmed-record destination yet; reject them or leave them as drafts.`
      );
    }

    const canonicalMap = await buildCanonicalMap();
    const accepted: string[] = [];
    const unmapped: string[] = [];
    const createdObservationTypes: string[] = [];
    const now = new Date();

    const currentJobAlreadyAccepted = await db.query.extractedItems.findFirst({
      where: and(
        eq(schema.extractedItems.extractionJobId, job.id),
        eq(schema.extractedItems.status, "accepted")
      ),
    });
    const replacingDocumentRecords = !currentJobAlreadyAccepted && body.acceptItemIds.length > 0;
    const previousObservationIds = replacingDocumentRecords
      ? (
          await db.query.observations.findMany({
            where: eq(schema.observations.documentId, doc.id),
            columns: { id: true },
          })
        ).map((row) => row.id)
      : [];
    const previousReportIds = replacingDocumentRecords
      ? (
          await db.query.clinicalReports.findMany({
            where: eq(schema.clinicalReports.documentId, doc.id),
            columns: { id: true },
          })
        ).map((row) => row.id)
      : [];

    for (const item of items) {
      if (body.rejectItemIds.includes(item.id)) {
        await db
          .update(schema.extractedItems)
          .set({ status: "rejected" })
          .where(eq(schema.extractedItems.id, item.id));
        continue;
      }
      if (item.status === "accepted") continue;

      if (item.itemType === "lab_observation" || item.itemType === "diagnostic_measurement") {
        const raw = item.rawJson as LabRaw;
        let type = raw.observation_type_id
          ? (await db.query.observationTypes.findFirst({
              where: eq(schema.observationTypes.id, raw.observation_type_id),
            })) ?? null
          : resolveObservationType(canonicalMap, inferredCanonicalCandidates(raw));

        if (
          !type &&
          (body.createMissingObservationTypes || item.itemType === "diagnostic_measurement")
        ) {
          type = await createValidatedObservationType({
            raw,
            canonicalMap,
            documentName: doc.originalFilename,
          });
          if (type) createdObservationTypes.push(type.canonicalName);
        }

        if (!type) {
          unmapped.push(raw.test_name ?? item.id);
          continue; // stays draft until the user maps it
        }

        const observedAt = raw.report_date
          ? new Date(raw.report_date)
          : doc.documentDate
            ? new Date(doc.documentDate)
            : doc.uploadedAt;

        const normalized = normalizeMetricRecord({
          metric: type.canonicalName,
          normalUnit: type.normalUnit,
          unit: raw.unit ?? type.normalUnit,
          valueNumeric: raw.value ?? null,
          referenceLow: raw.reference_low ?? null,
          referenceHigh: raw.reference_high ?? null,
        });

        await db.insert(schema.observations).values({
          profileId: job.profileId,
          documentId: doc.id,
          observationTypeId: type.id,
          observedAt,
          valueNumeric: normalized.valueNumeric,
          valueText: raw.value_text ?? null,
          unit: normalized.unit,
          referenceLow: normalized.referenceLow,
          referenceHigh: normalized.referenceHigh,
          interpretation: computeInterpretation(
            normalized.valueNumeric,
            normalized.referenceLow,
            normalized.referenceHigh,
            raw.interpretation ?? "unknown"
          ),
          source: "document",
          confidence: raw.confidence ?? item.confidence,
          status: "confirmed",
          metadataJson:
            item.itemType === "diagnostic_measurement"
              ? {
                  kind: "diagnostic_measurement",
                  studyName: raw.study_name ?? null,
                  reportType: raw.report_type ?? null,
                  modality: raw.modality ?? null,
                  pageNumber: raw.page_number ?? null,
                  pageStart: raw.page_start ?? null,
                  pageEnd: raw.page_end ?? null,
                  extractionItemId: item.id,
                }
              : raw.page_number
                ? { pageNumber: raw.page_number, extractionItemId: item.id }
                : { extractionItemId: item.id },
        });
      } else if (item.itemType === "diagnosis") {
        const raw = item.rawJson as DiagnosisRaw;
        const conditionName = raw.condition_name?.trim();
        const normalizedName = conditionName ? normalizeConditionName(conditionName) : "";
        if (conditionName && normalizedName) {
          await db
            .insert(schema.diagnoses)
            .values({
              profileId: job.profileId,
              documentId: doc.id,
              conditionName,
              normalizedName,
              category: raw.category ?? "other",
              clinicalStatus: raw.clinical_status ?? "unknown",
              certainty: raw.certainty ?? "unknown",
              severity: raw.severity ?? null,
              bodySite: raw.body_site ?? null,
              icd10Code: raw.icd10_code ?? null,
              onsetDate: raw.onset_date ?? null,
              recordedDate: raw.recorded_date ?? doc.documentDate ?? null,
              resolvedDate: raw.clinical_status === "resolved" ? raw.recorded_date ?? null : null,
              doctorName: raw.doctor_name ?? null,
              note: raw.note ?? null,
              pageNumber: raw.page_number ?? null,
              confidence: raw.confidence ?? item.confidence ?? null,
            })
            // Re-accepting the same document updates the existing condition
            // instead of stacking duplicates.
            .onConflictDoUpdate({
              target: [
                schema.diagnoses.profileId,
                schema.diagnoses.documentId,
                schema.diagnoses.normalizedName,
              ],
              set: {
                conditionName,
                category: raw.category ?? "other",
                clinicalStatus: raw.clinical_status ?? "unknown",
                certainty: raw.certainty ?? "unknown",
                severity: raw.severity ?? null,
                bodySite: raw.body_site ?? null,
                icd10Code: raw.icd10_code ?? null,
                onsetDate: raw.onset_date ?? null,
                recordedDate: raw.recorded_date ?? doc.documentDate ?? null,
                doctorName: raw.doctor_name ?? null,
                note: raw.note ?? null,
                pageNumber: raw.page_number ?? null,
                confidence: raw.confidence ?? item.confidence ?? null,
                updatedAt: now,
              },
            });
        }
      } else if (item.itemType === "report_summary") {
        const raw = item.rawJson as Record<string, unknown>;
        await db.insert(schema.clinicalReports).values({
          profileId: job.profileId,
          documentId: doc.id,
          reportType:
            raw.report_type === "imaging" ||
            raw.report_type === "specialist" ||
            raw.report_type === "procedure" ||
            raw.report_type === "discharge"
              ? raw.report_type
              : doc.documentType === "imaging"
                ? "imaging"
                : doc.documentType === "discharge_summary"
                  ? "discharge"
                  : doc.documentType === "specialist_report"
                    ? "specialist"
                    : "other",
          studyName: (raw.study_name as string) ?? null,
          modality: (raw.modality as string) ?? null,
          bodyPart: (raw.body_part as string) ?? null,
          specialty: (raw.specialty as string) ?? null,
          reportDate: (raw.report_date as string) ?? doc.documentDate,
          facility: (raw.facility as string) ?? null,
          doctorName: (raw.doctor_name as string) ?? null,
          summary: (raw.summary as string) ?? null,
          findingsJson: raw.findings ?? null,
          impression: (raw.impression as string) ?? null,
          followUpRecommended: !!raw.follow_up_recommended,
          pageStart: (raw.page_start as number) ?? null,
          pageEnd: (raw.page_end as number) ?? null,
        });
      } else if (item.itemType === "medication") {
        const raw = item.rawJson as {
          brand_name?: string | null;
          generic_name?: string | null;
          strength?: string | null;
          dose?: string | null;
          frequency?: string | null;
          duration?: string | null;
          report_date?: string | null;
        };
        const name = raw.brand_name ?? raw.generic_name;
        if (name) {
          const master = await upsertMedicationMaster({
            brandName: raw.brand_name,
            genericName: raw.generic_name,
            strength: raw.strength,
            source: "prescription",
          });
          const prescribedAt = raw.report_date
            ? new Date(raw.report_date)
            : doc.documentDate
              ? new Date(doc.documentDate)
              : doc.uploadedAt;
          const course = derivePrescriptionCourse(prescribedAt, raw.duration);
          await recordMedicationEvent({
            profileId: job.profileId,
            nameText: name,
            dose: raw.dose ?? raw.strength,
            frequency: raw.frequency,
            eventType: "prescribed",
            eventTime: prescribedAt,
            documentId: doc.id,
            medicationMasterId: master?.id ?? null,
            ...course,
          });
        }
      } else if (item.itemType === "genetic_variant") {
        const raw = item.rawJson as GeneticVariantRaw;
        const report = await ensureGeneticReport({
          profileId: job.profileId,
          documentId: doc.id,
          documentDate: doc.documentDate,
          uploadedAt: doc.uploadedAt,
          raw,
        });
        await db.insert(schema.geneticVariants).values({
          profileId: job.profileId,
          geneticReportId: report.id,
          documentId: doc.id,
          gene: raw.gene ?? null,
          variantId: raw.variant_id ?? null,
          marker: raw.marker ?? null,
          chromosome: raw.chromosome ?? null,
          position: raw.position ?? null,
          genotype: raw.genotype ?? null,
          phenotype: raw.phenotype ?? null,
          sourceSection: raw.source_section ?? null,
          metadataJson: { confidence: raw.confidence ?? item.confidence },
        });
      } else if (item.itemType === "genetic_risk" || item.itemType === "genetic_trait") {
        const raw = item.rawJson as GeneticRiskRaw;
        const report = await ensureGeneticReport({
          profileId: job.profileId,
          documentId: doc.id,
          documentDate: doc.documentDate,
          uploadedAt: doc.uploadedAt,
          raw,
        });
        if (raw.condition_name) {
          await db.insert(schema.geneticRiskAssessments).values({
            profileId: job.profileId,
            geneticReportId: report.id,
            documentId: doc.id,
            category: raw.category ?? (item.itemType === "genetic_trait" ? "trait" : "disease"),
            conditionName: raw.condition_name,
            assessment: raw.assessment ?? null,
            riskLevel: raw.risk_level ?? "unknown",
            lifetimeRiskPercent: raw.lifetime_risk_percent ?? null,
            populationRiskPercent: raw.population_risk_percent ?? null,
            variantScore: raw.variant_score ?? null,
            summary: raw.summary ?? null,
            metadataJson: { confidence: raw.confidence ?? item.confidence },
          });
        }
      } else if (item.itemType === "pharmacogenomic_result") {
        const raw = item.rawJson as PharmacogenomicRaw;
        const report = await ensureGeneticReport({
          profileId: job.profileId,
          documentId: doc.id,
          documentDate: doc.documentDate,
          uploadedAt: doc.uploadedAt,
          raw,
        });
        if (raw.drug_name && raw.implication) {
          await db.insert(schema.pharmacogenomicResults).values({
            profileId: job.profileId,
            geneticReportId: report.id,
            documentId: doc.id,
            drugName: raw.drug_name,
            gene: raw.gene ?? null,
            genotype: raw.genotype ?? null,
            phenotype: raw.phenotype ?? null,
            implication: raw.implication,
            actionability: raw.actionability ?? "unknown",
            recommendationSummary: raw.recommendation_summary ?? null,
            evidenceLevel: raw.evidence_level ?? null,
            metadataJson: { confidence: raw.confidence ?? item.confidence },
          });
        }
      }

      await db
        .update(schema.extractedItems)
        .set({ status: "accepted", acceptedAt: now })
        .where(eq(schema.extractedItems.id, item.id));
      accepted.push(item.id);
    }

    // Superseded records are removed only after the full replacement batch succeeds.
    if (accepted.length > 0 && previousObservationIds.length > 0) {
      await db
        .delete(schema.observations)
        .where(inArray(schema.observations.id, previousObservationIds));
    }
    if (accepted.length > 0 && previousReportIds.length > 0) {
      await db
        .delete(schema.clinicalReports)
        .where(inArray(schema.clinicalReports.id, previousReportIds));
    }

    if (accepted.length > 0) {
      if (replacingDocumentRecords) {
        await db
          .update(schema.clinicalImages)
          .set({ status: "superseded" })
          .where(
            and(
              eq(schema.clinicalImages.documentId, doc.id),
              ne(schema.clinicalImages.extractionJobId, job.id)
            )
          );
      }
      await db
        .update(schema.clinicalImages)
        .set({ status: "accepted" })
        .where(eq(schema.clinicalImages.extractionJobId, job.id));

      // Confirming this extraction settles the document, so any earlier job's
      // un-actioned drafts are obsolete. Left as `draft` they accumulate
      // indefinitely and misreport how much still needs review.
      const supersededJobs = await db.query.extractionJobs.findMany({
        where: and(
          eq(schema.extractionJobs.documentId, doc.id),
          ne(schema.extractionJobs.id, job.id)
        ),
        columns: { id: true },
      });
      if (supersededJobs.length > 0) {
        await db
          .update(schema.extractedItems)
          .set({ status: "rejected" })
          .where(
            and(
              inArray(
                schema.extractedItems.extractionJobId,
                supersededJobs.map((row) => row.id)
              ),
              eq(schema.extractedItems.status, "draft")
            )
          );
      }
    }

    // Job + document status roll-up
    const remainingDrafts = await db.query.extractedItems.findMany({
      where: and(
        eq(schema.extractedItems.extractionJobId, job.id),
        eq(schema.extractedItems.status, "draft")
      ),
      columns: { id: true },
    });

    const jobStatus = remainingDrafts.length === 0 ? "accepted" : "needs_review";
    await db
      .update(schema.extractionJobs)
      .set({ status: jobStatus })
      .where(eq(schema.extractionJobs.id, job.id));

    await db
      .update(schema.documents)
      .set({
        extractionStatus: accepted.length > 0 ? "confirmed" : doc.extractionStatus,
      })
      .where(eq(schema.documents.id, doc.id));

    await logAudit({
      userId,
      profileId: job.profileId,
      action: "accept_extraction",
      targetType: "extraction_job",
      targetId: job.id,
      detail: {
        accepted: accepted.length,
        rejected: body.rejectItemIds.length,
        unmapped,
        createdObservationTypes: Array.from(new Set(createdObservationTypes)),
      },
    });

    // New confirmed data → refresh the pre-computed insights after responding.
    if (accepted.length > 0) {
      after(() => scheduleInsightRefresh(job.profileId));
    }

    return NextResponse.json({
      accepted: accepted.length,
      rejected: body.rejectItemIds.length,
      unmapped,
      createdObservationTypes: Array.from(new Set(createdObservationTypes)),
      jobStatus,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
