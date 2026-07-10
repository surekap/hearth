import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { encryptBuffer, sha256Hex } from "@/lib/crypto";
import { extractionResultSchema, type ExtractionResult } from "@/lib/extraction/schemas";
import { getProfileAccess } from "@/lib/profile-access";
import { putObject } from "@/lib/storage";

const MAX_BYTES = 20 * 1024 * 1024;

const allowedMime: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const allowedExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);

export const documentTypeSchema = z.enum([
  "lab_report",
  "prescription",
  "imaging",
  "specialist_report",
  "discharge_summary",
  "genetic_report",
  "invoice",
  "other",
]);

export const documentSourceSchema = z.enum([
  "apollo",
  "whatsapp",
  "camera",
  "files",
  "manual",
  "unknown",
]);

export function sniffMime(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function configuredRoots() {
  const raw = process.env.HEARTH_INGEST_ROOTS ?? process.cwd();
  return raw
    .split(path.delimiter)
    .map((root) => path.resolve(root.trim()))
    .filter(Boolean);
}

export function assertAllowedPath(filePath: string) {
  const resolved = path.resolve(filePath);
  const roots = configuredRoots();
  const allowed = roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!allowed) {
    throw new Error(
      `Path is outside HEARTH_INGEST_ROOTS. Allowed roots: ${roots.join(", ")}`
    );
  }
  return resolved;
}

export async function requireMcpUser() {
  const token = process.env.HEARTH_API_TOKEN;
  if (!token) throw new Error("HEARTH_API_TOKEN is required for the Hearth MCP server.");
  const user = await db.query.users.findFirst({ where: eq(schema.users.apiToken, token) });
  if (!user) throw new Error("HEARTH_API_TOKEN does not match a Hearth user.");
  return user;
}

export async function requireMcpProfile(userId: string, profileId: string) {
  const access = await getProfileAccess(userId, profileId);
  if (!access) throw new Error("Profile not found for HEARTH_API_TOKEN user.");
  return access.profile;
}

export async function scanIngestFolder({
  folderPath,
  profileId,
  recursive,
}: {
  folderPath: string;
  profileId?: string;
  recursive: boolean;
}) {
  const root = assertAllowedPath(folderPath);
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) throw new Error("folderPath must be a directory.");

  const files: {
    path: string;
    filename: string;
    bytes: number;
    sha256: string;
    mimeType: string | null;
    uploadedDocumentId: string | null;
  }[] = [];

  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) await visit(entryPath);
        continue;
      }
      if (!entry.isFile() || !allowedExtensions.has(path.extname(entry.name).toLowerCase())) continue;

      const fileStat = await stat(entryPath);
      if (fileStat.size > MAX_BYTES) {
        files.push({
          path: entryPath,
          filename: entry.name,
          bytes: fileStat.size,
          sha256: "",
          mimeType: null,
          uploadedDocumentId: null,
        });
        continue;
      }

      const buffer = await readFile(entryPath);
      const mimeType = sniffMime(buffer);
      const sha256 = sha256Hex(buffer);
      const duplicate =
        profileId && mimeType
          ? await db.query.documents.findFirst({
              where: and(
                eq(schema.documents.profileId, profileId),
                eq(schema.documents.sha256Hash, sha256)
              ),
            })
          : null;
      files.push({
        path: entryPath,
        filename: entry.name,
        bytes: fileStat.size,
        sha256,
        mimeType,
        uploadedDocumentId: duplicate?.id ?? null,
      });
    }
  }

  await visit(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { root, files };
}

export async function readLocalFilePayload(filePath: string) {
  const resolved = assertAllowedPath(filePath);
  const buffer = await readFile(resolved);
  if (buffer.length > MAX_BYTES) throw new Error("File is too large (max 20MB).");
  const mimeType = sniffMime(buffer);
  if (!mimeType || !allowedMime[mimeType]) {
    throw new Error("Only PDF, JPEG, PNG and WebP files are supported.");
  }
  return {
    path: resolved,
    filename: path.basename(resolved),
    bytes: buffer.length,
    sha256: sha256Hex(buffer),
    mimeType,
    base64: buffer.toString("base64"),
  };
}

export async function uploadLocalDocument({
  filePath,
  profileId,
  userId,
  documentType,
  source,
  documentDate,
}: {
  filePath: string;
  profileId: string;
  userId: string;
  documentType: z.infer<typeof documentTypeSchema>;
  source: z.infer<typeof documentSourceSchema>;
  documentDate?: string | null;
}) {
  await requireMcpProfile(userId, profileId);
  const payload = await readLocalFilePayload(filePath);
  const duplicate = await db.query.documents.findFirst({
    where: and(
      eq(schema.documents.profileId, profileId),
      eq(schema.documents.sha256Hash, payload.sha256)
    ),
  });
  if (duplicate) {
    const job = await latestExtractionJob(duplicate.id);
    return { document: duplicate, extractionJob: job, duplicate: true };
  }

  const buffer = Buffer.from(payload.base64, "base64");
  const encrypted = encryptBuffer(buffer);
  const key = `documents/${profileId}/${payload.sha256}.${allowedMime[payload.mimeType]}.enc`;
  const storedKey = await putObject(key, encrypted);

  const [document] = await db
    .insert(schema.documents)
    .values({
      profileId,
      uploadedByUserId: userId,
      documentType,
      source,
      originalFilename: payload.filename,
      mimeType: payload.mimeType,
      storageKey: storedKey,
      sha256Hash: payload.sha256,
      documentDate: documentDate ?? null,
      encrypted: true,
    })
    .returning();

  const [extractionJob] = await db
    .insert(schema.extractionJobs)
    .values({
      documentId: document.id,
      profileId,
      status: "pending",
      piiRedacted: false,
    })
    .returning();

  await db.insert(schema.auditLogs).values({
    userId,
    profileId,
    action: "mcp_upload",
    targetType: "document",
    targetId: document.id,
    detail: { filename: payload.filename, mime: payload.mimeType, bytes: payload.bytes },
  });

  return { document, extractionJob, duplicate: false };
}

export async function latestExtractionJob(documentId: string) {
  return db.query.extractionJobs.findFirst({
    where: eq(schema.extractionJobs.documentId, documentId),
    orderBy: [desc(schema.extractionJobs.createdAt)],
  });
}

function extractionItemsFromResult({
  result,
  jobId,
  profileId,
}: {
  result: ExtractionResult;
  jobId: string;
  profileId: string;
}) {
  const itemValues: (typeof schema.extractedItems.$inferInsert)[] = [];
  for (const obs of result.observations) {
    itemValues.push({
      extractionJobId: jobId,
      profileId,
      itemType: "lab_observation",
      status: "draft",
      rawJson: { ...obs, report_date: result.report_date },
      confidence: obs.confidence,
    });
  }
  for (const med of result.medications) {
    itemValues.push({
      extractionJobId: jobId,
      profileId,
      itemType: "medication",
      status: "draft",
      rawJson: { ...med, report_date: result.report_date },
      confidence: med.confidence,
    });
  }
  for (const variant of result.genetic_variants) {
    itemValues.push({
      extractionJobId: jobId,
      profileId,
      itemType: "genetic_variant",
      status: "draft",
      rawJson: { ...variant, genetic_report: result.genetic_report, report_date: result.report_date },
      confidence: variant.confidence,
    });
  }
  for (const risk of result.genetic_risks) {
    itemValues.push({
      extractionJobId: jobId,
      profileId,
      itemType: risk.category === "trait" ? "genetic_trait" : "genetic_risk",
      status: "draft",
      rawJson: { ...risk, genetic_report: result.genetic_report, report_date: result.report_date },
      confidence: risk.confidence,
    });
  }
  for (const pgx of result.pharmacogenomics) {
    itemValues.push({
      extractionJobId: jobId,
      profileId,
      itemType: "pharmacogenomic_result",
      status: "draft",
      rawJson: { ...pgx, genetic_report: result.genetic_report, report_date: result.report_date },
      confidence: pgx.confidence,
    });
  }
  if (result.report) {
    itemValues.push({
      extractionJobId: jobId,
      profileId,
      itemType: "report_summary",
      status: "draft",
      rawJson: { ...result.report, report_date: result.report_date },
      confidence: result.report.confidence,
    });
  }
  return itemValues;
}

export async function submitExternalExtraction({
  documentId,
  userId,
  extraction,
  modelUsed,
  promptVersion,
}: {
  documentId: string;
  userId: string;
  extraction: unknown;
  modelUsed?: string | null;
  promptVersion?: string | null;
}) {
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
  if (!doc) throw new Error("Document not found.");
  await requireMcpProfile(userId, doc.profileId);

  const result = extractionResultSchema.parse(extraction);

  const [job] = await db.transaction(async (tx) => {
    await tx
      .update(schema.extractionJobs)
      .set({
        status: "failed",
        error: "Replaced by external MCP extraction.",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.extractionJobs.documentId, doc.id),
          inArray(schema.extractionJobs.status, ["pending", "processing", "needs_review"])
        )
      );

    const [createdJob] = await tx
      .insert(schema.extractionJobs)
      .values({
        documentId: doc.id,
        profileId: doc.profileId,
        status: "needs_review",
        modelUsed: modelUsed ?? "external-mcp-client",
        promptVersion: promptVersion ?? "external",
        piiRedacted: false,
        completedAt: new Date(),
      })
      .returning();

    await tx.insert(schema.documentText).values({
      documentId: doc.id,
      rawText: result.raw_text,
      ocrEngine: modelUsed ?? "external-mcp-client",
      confidence: null,
    });

    const items = extractionItemsFromResult({
      result,
      jobId: createdJob.id,
      profileId: doc.profileId,
    });
    if (items.length > 0) await tx.insert(schema.extractedItems).values(items);

    await tx
      .update(schema.documents)
      .set({
        ocrStatus: "complete",
        extractionStatus: "draft",
        documentType: doc.documentType === "other" ? result.document_type : doc.documentType,
        documentDate: doc.documentDate ?? result.report_date,
      })
      .where(eq(schema.documents.id, doc.id));

    await tx.insert(schema.auditLogs).values({
      userId,
      profileId: doc.profileId,
      action: "mcp_submit_extraction",
      targetType: "extraction_job",
      targetId: createdJob.id,
      detail: {
        documentId: doc.id,
        itemCount: items.length,
        modelUsed: modelUsed ?? "external-mcp-client",
      },
    });

    return [createdJob, items.length] as const;
  });

  const itemCount = await db.query.extractedItems.findMany({
    where: eq(schema.extractedItems.extractionJobId, job.id),
  });

  return {
    job,
    itemCount: itemCount.length,
    warnings: result.warnings,
    reviewUrl: `${process.env.HEARTH_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/documents/${doc.id}/review`,
  };
}

export async function getDocumentIngestStatus({
  documentId,
  userId,
}: {
  documentId: string;
  userId: string;
}) {
  const document = await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
  if (!document) throw new Error("Document not found.");
  await requireMcpProfile(userId, document.profileId);
  const job = await latestExtractionJob(document.id);
  const items = job
    ? await db.query.extractedItems.findMany({
        where: eq(schema.extractedItems.extractionJobId, job.id),
        orderBy: [desc(schema.extractedItems.createdAt)],
      })
    : [];
  return {
    document,
    extractionJob: job,
    itemCount: items.length,
    items: items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      status: item.status,
      confidence: item.confidence,
      rawJson: item.rawJson,
    })),
    reviewUrl: `${process.env.HEARTH_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/documents/${document.id}/review`,
  };
}
