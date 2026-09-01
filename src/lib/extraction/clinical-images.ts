import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { db, schema } from "@/db";
import { encryptBuffer, sha256Hex } from "@/lib/crypto";
import { putObject } from "@/lib/storage";
import type { ExtractedReport, ExtractionResult } from "./schemas";
import { inferClinicalImageKind } from "./clinical-image-metadata";

export { inferClinicalImageKind } from "./clinical-image-metadata";

const execFileAsync = promisify(execFile);

type DocumentForImages = Pick<
  typeof schema.documents.$inferSelect,
  "id" | "profileId" | "mimeType" | "originalFilename" | "documentDate"
>;

type PageCandidate = { page: number; reports: ExtractedReport[] };

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function inferLaterality(report: ExtractedReport): string | null {
  const value = `${report.study_name} ${report.body_part ?? ""}`.toLowerCase();
  if (/\bbilateral\b|\bboth\b/.test(value)) return "bilateral";
  if (/\bleft\b|\bos\b/.test(value)) return "left";
  if (/\bright\b|\bod\b/.test(value)) return "right";
  return null;
}

function choosePrimaryReport(reports: ExtractedReport[]) {
  return [...reports].sort((a, b) => {
    const aSpan = (a.page_end ?? 9999) - (a.page_start ?? 0);
    const bSpan = (b.page_end ?? 9999) - (b.page_start ?? 0);
    return aSpan - bSpan;
  })[0];
}

function reportPages(result: ExtractionResult): PageCandidate[] {
  const byPage = new Map<number, ExtractedReport[]>();
  for (const report of result.reports) {
    if (!report.page_start || !report.page_end) continue;
    for (let page = report.page_start; page <= report.page_end; page += 1) {
      const reports = byPage.get(page) ?? [];
      reports.push(report);
      byPage.set(page, reports);
    }
  }
  return [...byPage.entries()]
    .map(([page, reports]) => ({ page, reports }))
    .sort((a, b) => a.page - b.page);
}

function jpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (length < 2) break;
    offset += 2 + length;
  }
  return { width: null, height: null };
}

async function insertImage(input: {
  doc: DocumentForImages;
  jobId: string;
  plain: Buffer;
  mimeType: string;
  sourcePage: number | null;
  report: ExtractedReport | null;
  relatedReports: ExtractedReport[];
}) {
  const kind = input.report ? inferClinicalImageKind(input.report) : "uploaded_image";
  const laterality = input.report ? inferLaterality(input.report) : null;
  const subject = input.report?.body_part || input.report?.study_name || input.doc.originalFilename;
  const comparisonKey = `${kind}:${laterality ?? "unspecified"}:${slug(subject) || "unspecified"}`;
  const hash = sha256Hex(input.plain);
  const extension = input.mimeType === "image/jpeg" ? "jpg" : "png";
  const key = `clinical-images/${input.doc.profileId}/${input.doc.id}/${input.jobId}/${input.sourcePage ?? 1}-${hash}.${extension}.enc`;
  const storedKey = await putObject(key, encryptBuffer(input.plain));
  const dimensions = input.mimeType === "image/jpeg" ? jpegDimensions(input.plain) : { width: null, height: null };

  await db.insert(schema.clinicalImages).values({
    profileId: input.doc.profileId,
    documentId: input.doc.id,
    extractionJobId: input.jobId,
    assetKind: kind,
    comparisonKey,
    studyName: input.report?.study_name ?? null,
    modality: input.report?.modality ?? null,
    bodyPart: input.report?.body_part ?? null,
    laterality,
    reportDate: input.report?.report_date ?? input.doc.documentDate,
    sourcePage: input.sourcePage,
    pageLabel: input.report
      ? `${input.report.study_name}${input.sourcePage ? ` · source page ${input.sourcePage}` : ""}`
      : input.doc.originalFilename,
    storageKey: storedKey,
    sha256Hash: hash,
    mimeType: input.mimeType,
    width: dimensions.width,
    height: dimensions.height,
    metadataJson: {
      derivative: input.sourcePage ? "full_page_render" : "original_image",
      sourcePage: input.sourcePage,
      relatedStudies: input.relatedReports.map((report) => report.study_name),
      warning:
        "For longitudinal viewing only. Page layout, scale, orientation, and scanner settings may differ between studies.",
    },
  });
}

/**
 * Preserve image-bearing clinical material as encrypted, authenticated assets.
 * Full-page rendering deliberately avoids unsafe AI cropping and retains labels,
 * legends, acquisition settings, and scale alongside the diagnostic image.
 */
export async function extractClinicalImages(input: {
  doc: DocumentForImages;
  jobId: string;
  result: ExtractionResult;
  plainDocument: Buffer;
}) {
  if (input.doc.mimeType.startsWith("image/")) {
    await insertImage({
      doc: input.doc,
      jobId: input.jobId,
      plain: input.plainDocument,
      mimeType: input.doc.mimeType,
      sourcePage: null,
      report: input.result.reports[0] ?? null,
      relatedReports: input.result.reports,
    });
    return 1;
  }
  if (input.doc.mimeType !== "application/pdf") return 0;

  const pages = reportPages(input.result);
  if (pages.length === 0) return 0;
  const tempDir = await mkdtemp(path.join(tmpdir(), "hearth-clinical-images-"));
  const pdfPath = path.join(tempDir, "source.pdf");
  await writeFile(pdfPath, input.plainDocument);
  let count = 0;
  try {
    for (const candidate of pages) {
      const prefix = path.join(tempDir, `page-${candidate.page}`);
      await execFileAsync("pdftoppm", [
        "-f",
        String(candidate.page),
        "-l",
        String(candidate.page),
        "-singlefile",
        "-jpeg",
        "-r",
        "180",
        "-jpegopt",
        "quality=90",
        pdfPath,
        prefix,
      ]);
      const plain = await readFile(`${prefix}.jpg`);
      await insertImage({
        doc: input.doc,
        jobId: input.jobId,
        plain,
        mimeType: "image/jpeg",
        sourcePage: candidate.page,
        report: choosePrimaryReport(candidate.reports),
        relatedReports: candidate.reports,
      });
      count += 1;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  return count;
}
