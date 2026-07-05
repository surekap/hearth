import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptBuffer } from "@/lib/crypto";
import { getObject } from "@/lib/storage";
import { extractWithOpenAI, type ProviderOutput } from "./openai";
import { extractWithMock } from "./mock";

export function extractionProviderName(): "openai" | "mock" {
  if (process.env.EXTRACTION_PROVIDER === "mock") return "mock";
  return process.env.OPENAI_API_KEY ? "openai" : "mock";
}

/**
 * Runs OCR + LLM extraction for a document and stores draft extracted_items.
 * Draft items are never trusted: confirmed observations are only written when
 * the user accepts rows on the review screen.
 */
export async function processDocument(documentId: string) {
  const doc = await db.query.documents.findFirst({
    where: eq(schema.documents.id, documentId),
  });
  if (!doc) throw new Error("Document not found");

  const [job] = await db
    .insert(schema.extractionJobs)
    .values({
      documentId: doc.id,
      profileId: doc.profileId,
      status: "processing",
      promptVersion: null,
      piiRedacted: false,
    })
    .returning();

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
      });
    } else {
      output = await extractWithMock({
        filename: doc.originalFilename,
        documentDate: doc.documentDate,
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
