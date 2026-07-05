import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { scheduleInsightRefresh } from "@/lib/ai/insights";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError, logAudit } from "@/lib/api";
import {
  buildCanonicalMap,
  resolveObservationType,
  computeInterpretation,
} from "@/lib/extraction/canonical";
import { recordMedicationEvent, upsertMedicationMaster } from "@/lib/medications";

const bodySchema = z.object({
  acceptItemIds: z.array(z.string().uuid()),
  rejectItemIds: z.array(z.string().uuid()).default([]),
});

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
};

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

    const canonicalMap = await buildCanonicalMap();
    const accepted: string[] = [];
    const unmapped: string[] = [];
    const now = new Date();

    for (const item of items) {
      if (body.rejectItemIds.includes(item.id)) {
        await db
          .update(schema.extractedItems)
          .set({ status: "rejected" })
          .where(eq(schema.extractedItems.id, item.id));
        continue;
      }
      if (item.status === "accepted") continue;

      if (item.itemType === "lab_observation") {
        const raw = item.rawJson as LabRaw;
        const type = raw.observation_type_id
          ? (await db.query.observationTypes.findFirst({
              where: eq(schema.observationTypes.id, raw.observation_type_id),
            })) ?? null
          : resolveObservationType(canonicalMap, [raw.canonical_name, raw.test_name]);

        if (!type) {
          unmapped.push(raw.test_name ?? item.id);
          continue; // stays draft until the user maps it
        }

        const observedAt = raw.report_date
          ? new Date(raw.report_date)
          : doc.documentDate
            ? new Date(doc.documentDate)
            : doc.uploadedAt;

        await db.insert(schema.observations).values({
          profileId: job.profileId,
          documentId: doc.id,
          observationTypeId: type.id,
          observedAt,
          valueNumeric: raw.value ?? null,
          valueText: raw.value_text ?? null,
          unit: raw.unit ?? type.normalUnit,
          referenceLow: raw.reference_low ?? null,
          referenceHigh: raw.reference_high ?? null,
          interpretation: computeInterpretation(
            raw.value ?? null,
            raw.reference_low ?? null,
            raw.reference_high ?? null,
            raw.interpretation ?? "unknown"
          ),
          source: "document",
          confidence: raw.confidence ?? item.confidence,
          status: "confirmed",
        });
      } else if (item.itemType === "report_summary") {
        const raw = item.rawJson as Record<string, unknown>;
        await db.insert(schema.clinicalReports).values({
          profileId: job.profileId,
          documentId: doc.id,
          reportType:
            doc.documentType === "imaging"
              ? "imaging"
              : doc.documentType === "discharge_summary"
                ? "discharge"
                : doc.documentType === "specialist_report"
                  ? "specialist"
                  : "other",
          specialty: (raw.specialty as string) ?? null,
          reportDate: (raw.report_date as string) ?? doc.documentDate,
          facility: (raw.facility as string) ?? null,
          doctorName: (raw.doctor_name as string) ?? null,
          summary: (raw.summary as string) ?? null,
          findingsJson: raw.findings ?? null,
          impression: (raw.impression as string) ?? null,
          followUpRecommended: !!raw.follow_up_recommended,
        });
      } else if (item.itemType === "medication") {
        const raw = item.rawJson as {
          brand_name?: string | null;
          generic_name?: string | null;
          strength?: string | null;
          dose?: string | null;
          frequency?: string | null;
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
          await recordMedicationEvent({
            profileId: job.profileId,
            nameText: name,
            dose: raw.dose ?? raw.strength,
            frequency: raw.frequency,
            eventType: "prescribed",
            eventTime: raw.report_date
              ? new Date(raw.report_date)
              : doc.documentDate
                ? new Date(doc.documentDate)
                : doc.uploadedAt,
            documentId: doc.id,
            medicationMasterId: master?.id ?? null,
          });
        }
      }

      await db
        .update(schema.extractedItems)
        .set({ status: "accepted", acceptedAt: now })
        .where(eq(schema.extractedItems.id, item.id));
      accepted.push(item.id);
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
      detail: { accepted: accepted.length, rejected: body.rejectItemIds.length, unmapped },
    });

    // New confirmed data → refresh the pre-computed insights after responding.
    if (accepted.length > 0) {
      after(() => scheduleInsightRefresh(job.profileId));
    }

    return NextResponse.json({
      accepted: accepted.length,
      rejected: body.rejectItemIds.length,
      unmapped,
      jobStatus,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
