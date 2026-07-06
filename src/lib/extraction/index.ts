import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptBuffer } from "@/lib/crypto";
import { getObject } from "@/lib/storage";
import { extractWithOpenAI, type ProviderOutput } from "./openai";
import { extractWithMock } from "./mock";

export function extractionProviderName(): "openai" | "mock" {
  if (process.env.EXTRACTION_PROVIDER === "mock") return "mock";
  return process.env.OPENAI_API_KEY ? "openai" : "mock";
}

type ProcessResult = { jobId: string; itemCount: number; warnings: string[] };

const ACTIVE_JOB_STATUSES = ["pending", "processing", "needs_review"] as const;

export async function queueDocumentExtraction(
  documentId: string,
  options: { force?: boolean } = {}
) {
  const doc = await db.query.documents.findFirst({
    where: eq(schema.documents.id, documentId),
  });
  if (!doc) throw new Error("Document not found");

  const reusableStatuses = options.force
    ? (["pending", "processing"] as const)
    : ACTIVE_JOB_STATUSES;
  const existing = await db.query.extractionJobs.findFirst({
    where: and(
      eq(schema.extractionJobs.documentId, doc.id),
      inArray(schema.extractionJobs.status, [...reusableStatuses])
    ),
    orderBy: [desc(schema.extractionJobs.createdAt)],
  });
  if (existing) return existing;

  const [job] = await db
    .insert(schema.extractionJobs)
    .values({
      documentId: doc.id,
      profileId: doc.profileId,
      status: "pending",
      promptVersion: null,
      piiRedacted: false,
    })
    .returning();

  await db
    .update(schema.documents)
    .set({ ocrStatus: "pending", extractionStatus: "pending" })
    .where(eq(schema.documents.id, doc.id));

  return job;
}

/**
 * Runs OCR + LLM extraction for a queued document and stores draft extracted_items.
 * Draft items are never trusted: confirmed observations are only written when
 * the user accepts rows on the review screen.
 */
export async function processExtractionJob(jobId: string): Promise<ProcessResult> {
  const job = await db.query.extractionJobs.findFirst({
    where: eq(schema.extractionJobs.id, jobId),
  });
  if (!job) throw new Error("Extraction job not found");
  if (!["pending", "processing"].includes(job.status)) {
    return { jobId: job.id, itemCount: 0, warnings: [`Job is already ${job.status}`] };
  }

  const doc = await db.query.documents.findFirst({
    where: eq(schema.documents.id, job.documentId),
  });
  if (!doc) throw new Error("Document not found");

  await db
    .update(schema.extractionJobs)
    .set({ status: "processing", error: null })
    .where(eq(schema.extractionJobs.id, job.id));

  try {
    const provider = extractionProviderName();
    let output: ProviderOutput;
    if (provider === "openai") {
      const encrypted = await getObject(doc.storageKey);
      const buffer = decryptBuffer(encrypted);
      output = await extractWithOpenAI({
        buffer,
        mimeType: doc.mimeType,
        filename: doc.originalFilename,
        documentTypeHint: doc.documentType,
      });
    } else {
      output = await extractWithMock({
        filename: doc.originalFilename,
        documentDate: doc.documentDate,
        documentType: doc.documentType,
      });
    }

    const { result } = output;

    await db.insert(schema.documentText).values({
      documentId: doc.id,
      rawText: result.raw_text,
      ocrEngine: output.engine,
      confidence: null,
    });

    // Draft items: one per lab observation, medication, and report summary.
    const itemValues: (typeof schema.extractedItems.$inferInsert)[] = [];
    for (const obs of result.observations) {
      itemValues.push({
        extractionJobId: job.id,
        profileId: doc.profileId,
        itemType: "lab_observation",
        status: "draft",
        rawJson: { ...obs, report_date: result.report_date },
        confidence: obs.confidence,
      });
    }
    for (const med of result.medications) {
      itemValues.push({
        extractionJobId: job.id,
        profileId: doc.profileId,
        itemType: "medication",
        status: "draft",
        rawJson: { ...med, report_date: result.report_date },
        confidence: med.confidence,
      });
    }
    for (const variant of result.genetic_variants) {
      itemValues.push({
        extractionJobId: job.id,
        profileId: doc.profileId,
        itemType: "genetic_variant",
        status: "draft",
        rawJson: { ...variant, genetic_report: result.genetic_report, report_date: result.report_date },
        confidence: variant.confidence,
      });
    }
    for (const risk of result.genetic_risks) {
      itemValues.push({
        extractionJobId: job.id,
        profileId: doc.profileId,
        itemType: risk.category === "trait" ? "genetic_trait" : "genetic_risk",
        status: "draft",
        rawJson: { ...risk, genetic_report: result.genetic_report, report_date: result.report_date },
        confidence: risk.confidence,
      });
    }
    for (const pgx of result.pharmacogenomics) {
      itemValues.push({
        extractionJobId: job.id,
        profileId: doc.profileId,
        itemType: "pharmacogenomic_result",
        status: "draft",
        rawJson: { ...pgx, genetic_report: result.genetic_report, report_date: result.report_date },
        confidence: pgx.confidence,
      });
    }
    if (result.report) {
      itemValues.push({
        extractionJobId: job.id,
        profileId: doc.profileId,
        itemType: "report_summary",
        status: "draft",
        rawJson: { ...result.report, report_date: result.report_date },
        confidence: result.report.confidence,
      });
    }
    if (itemValues.length > 0) {
      await db.insert(schema.extractedItems).values(itemValues);
    }

    // Auto-detected metadata: fill gaps, never overwrite user-set values.
    await db
      .update(schema.documents)
      .set({
        ocrStatus: "complete",
        extractionStatus: "draft",
        documentType:
          doc.documentType === "other" ? result.document_type : doc.documentType,
        documentDate: doc.documentDate ?? result.report_date,
      })
      .where(eq(schema.documents.id, doc.id));

    await db
      .update(schema.extractionJobs)
      .set({
        status: "needs_review",
        modelUsed: output.model,
        promptVersion: output.promptVersion,
        inputTokenCount: output.inputTokens,
        outputTokenCount: output.outputTokens,
        completedAt: new Date(),
      })
      .where(eq(schema.extractionJobs.id, job.id));

    return { jobId: job.id, itemCount: itemValues.length, warnings: result.warnings };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .update(schema.extractionJobs)
      .set({ status: "failed", error: message, completedAt: new Date() })
      .where(eq(schema.extractionJobs.id, job.id));
    await db
      .update(schema.documents)
      .set({ ocrStatus: "failed", extractionStatus: "failed" })
      .where(eq(schema.documents.id, doc.id));
    throw e;
  }
}

/**
 * Compatibility wrapper for places that need to process one document immediately.
 * New uploads should call queueDocumentExtraction and let drainExtractionQueue run
 * in the background.
 */
export async function processDocument(documentId: string) {
  const job = await queueDocumentExtraction(documentId, { force: true });
  return processExtractionJob(job.id);
}

export async function drainExtractionQueue(options: { limit?: number } = {}) {
  const limit = options.limit ?? 3;
  const result = await db.execute<{ id: string }>(sql`
    update extraction_jobs
    set status = 'processing', error = null
    where id in (
      select id
      from extraction_jobs
      where
        status = 'pending'
        or (
          status = 'processing'
          and completed_at is null
          and created_at < now() - interval '15 minutes'
        )
      order by created_at asc
      for update skip locked
      limit ${limit}
    )
    returning id
  `);

  const rows = result.rows as { id: string }[];
  const processed: ProcessResult[] = [];
  for (const row of rows) {
    try {
      processed.push(await processExtractionJob(row.id));
    } catch (e) {
      console.error("queued extraction failed", { jobId: row.id, error: e });
    }
  }
  return processed;
}

export function scheduleExtractionQueueDrain(options: { limit?: number } = {}) {
  drainExtractionQueue(options).catch((e) => console.error("extraction queue drain failed", e));
}
