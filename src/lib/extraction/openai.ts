import OpenAI from "openai";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { extractionModel } from "../ai/models";
import {
  extractionResultSchema,
  OPENAI_JSON_SCHEMA,
  type ExtractionResult,
  type ExtractedReport,
  type ExtractedDiagnosis,
  normalizeConditionName,
  PROMPT_VERSION,
} from "./schemas";

export type ProviderOutput = {
  result: ExtractionResult;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  engine: string;
};

const PDF_CHUNK_PAGES = 12;
const PDF_CHUNK_OVERLAP = 1;
const CHUNK_CONCURRENCY = 2;

const SYSTEM_PROMPT = `You are a meticulous medical document extraction engine for a personal health record.
You may receive one medical report or a page range from a bundle containing several independent reports.

Rules:
- Extract ONLY what is printed. Never invent values, units, reference ranges, page numbers, or diagnoses.
- Inspect every supplied page. Do not stop at the first page or visible preview.
- Transcribe all clinically relevant source text. Preserve page boundaries with "[Page N]" markers.
- Every independent non-lab study must be a separate object in reports. Never combine X-ray, ECG, spirometry, echocardiography, stress testing, ultrasound, DEXA, or body composition into one report.
- Put every printed lab result in observations, including qualitative results, sub-panels, and table continuations.
- Put EVERY labeled numeric or categorical result from a non-lab study in that report's measurements array, not only headline or abnormal values. Examples include FEV1/FVC, EF, chamber dimensions, METS, heart rate, BMD, T-score, Z-score, BMI, fat mass, and VAT/SAT.
- canonical_name: use a stable international or plain-English measurement name. Keep it null if unsure.
- Numeric results go in value; qualitative results go in value_text.
- Reference ranges: parse "0-45", "<150", and ">40" into reference_low/reference_high, leaving the missing side null.
- interpretation: use only printed flags or the printed result versus printed range. Use unknown when no range or flag exists.
- Dates must follow the source's locale, not US month/day assumptions. Indian hospital dates are normally DD/MM/YYYY: for example, 01/09/2026 is 1 September 2026, not January 9. Use spelled-out dates elsewhere in the bundle, collection/report chronology, facility location, and patient context to resolve numeric dates consistently. If still ambiguous, use null and add an uncertain_items entry.
- report_date at the document level is only for a date shared by the entire supplied input. Use null for a bundle with multiple dates. Every observation must carry the date printed on its own page in observation.report_date; do not copy a date from another page or report.
- Assign each observation and measurement its absolute page number when visible or provided in the request.
- Each PDF page may contain a small synthetic "HEARTH SOURCE PAGE N OF M" marker at its top edge. Use N for provenance, but never transcribe the marker as medical source text or treat it as a finding.
- Every report needs study_name, report_type, page_start, and page_end. Use the absolute page numbers supplied in the request.
- For imaging, preserve the complete findings and impression, including printed image/page comments.
- For DEXA/body-composition reports, transcribe every populated table cell that represents a clinical measurement. This includes total and regional BMD/T-score/Z-score; total mass, tissue mass, fat-free mass, lean mass, fat mass and BMC; tissue and region fat percentages; android/gynoid values and ratio; VAT/SAT volume, mass and area; right/left balance; and measured age/height/weight when printed. Preserve the source page and exact unit. Do not omit values because they repeat elsewhere; chunk merging will deduplicate exact duplicates.
- Put every clinician-asserted condition in diagnoses: impressions, assessments, problem lists, "known case of" history, and discharge diagnoses. A diagnosis is a named condition such as "Fatty liver grade II" or "Type 2 diabetes mellitus"; a measured value such as "ALT 67 U/L" is never a diagnosis. Record the condition in condition_name and any printed grade/stage separately in severity.
- diagnoses.certainty must reflect the printed wording: use suspected for "rule out", "query", "likely" or differential lists, ruled_out when explicitly excluded, and confirmed only for an unhedged assertion. Never upgrade hedged wording. A finding that only appears inside a report impression still belongs in diagnoses as well as in that report's impression.
- Never derive a diagnosis from a genetic predisposition, a family history mention, or an out-of-range lab value on its own.
- For prescriptions fill medications.
- Anything ambiguous goes into uncertain_items; document-level or page-quality problems go into warnings.
- You may be given a slice of a larger document; the remaining pages are being processed separately. Never warn that pages outside your supplied range are missing, unsupplied, or incomplete, and never warn that a report continues beyond your range. Report only problems with the pages you were actually given.
- coverage must honestly report the supplied document page total, pages processed, sections detected/extracted, and pages that could not be represented.
- Respect a non-other document type hint.
- For genetic reports, use genetic_report, genetic_risks, genetic_variants, and pharmacogenomics. Do not upgrade predisposition into diagnosis or prescribing advice.`;

type Chunk = {
  buffer: Buffer;
  pageStart: number;
  pageEnd: number;
  pagesTotal: number;
};

// Lower rank == more cautious, so merging never inflates certainty. "unknown" is
// deliberately absent: it means "the document did not say", which must neither
// override an explicit reading nor be preferred over one.
const DIAGNOSIS_CERTAINTY_ORDER = ["ruled_out", "suspected", "probable", "confirmed"];

/** Returns the more cautious of two readings, ignoring uninformative "unknown". */
function moreCautiousCertainty(
  a: ExtractedDiagnosis["certainty"],
  b: ExtractedDiagnosis["certainty"]
): ExtractedDiagnosis["certainty"] {
  if (a === "unknown") return b;
  if (b === "unknown") return a;
  return DIAGNOSIS_CERTAINTY_ORDER.indexOf(a) <= DIAGNOSIS_CERTAINTY_ORDER.indexOf(b) ? a : b;
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function dedupUnit(unit: string | null): string | null {
  return unit?.normalize("NFKC").replace(/\u03bc/g, "\u00b5").replace(/\s+/g, "").toLowerCase() ?? null;
}

function normalizedReportName(report: ExtractedReport): string {
  return report.study_name
    .toLowerCase()
    .replace(/\b(2d|report|study|test)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pageRangesTouch(a: ExtractedReport, b: ExtractedReport): boolean {
  if (!a.page_start || !a.page_end || !b.page_start || !b.page_end) return false;
  return a.page_start <= b.page_end + 1 && b.page_start <= a.page_end + 1;
}

function sameReport(a: ExtractedReport, b: ExtractedReport): boolean {
  if (normalizedReportName(a) !== normalizedReportName(b)) return false;
  return a.report_date === b.report_date || pageRangesTouch(a, b);
}

function reportDetailScore(report: ExtractedReport): number {
  return (
    (report.summary?.length ?? 0) +
    (report.impression?.length ?? 0) +
    report.findings.reduce((sum, finding) => sum + finding.length, 0)
  );
}

function longer(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function isInternalChunkNotice(notice: string): boolean {
  const normalized = notice.toLowerCase();
  return (
    normalized.includes("supplied pages are original document pages") ||
    normalized.includes("supplied pages are the original document pages") ||
    normalized.includes("parsed text labels pages as") ||
    normalized.includes("remapped to absolute page numbers") ||
    normalized.includes("page provenance follows the requested absolute page range") ||
    normalized.includes("source page order in the parsed text differs")
  );
}

/**
 * Each chunk only sees a slice of the document, so the model routinely reports
 * that the pages outside its slice "were not supplied". That is true of the
 * chunk and false of the document, and surfacing it alarms the user about data
 * that other chunks did extract.
 *
 * Phrase matching alone cannot catch this — the model words it differently every
 * time — so the caller pairs this with proof: the claim is only dropped when
 * merged coverage shows the pages really were represented.
 */
export function claimsUnsuppliedPages(notice: string): boolean {
  const normalized = notice.toLowerCase();
  if (!/\bpages?\b/.test(normalized)) return false;
  return (
    // Deliberately narrow. Suppressing a genuine warning hides a real problem,
    // which is worse than showing a redundant one, so match only wording that is
    // specifically about pages being absent from the input.
    /\bnot\s+(supplied|provided|included|available|present)\b/.test(normalized) ||
    /\bonly\s+pages?\b/.test(normalized) ||
    /\bmissing\s+(page|third page|pages)\b/.test(normalized) ||
    /\bcontinues?\s+beyond\b/.test(normalized) ||
    /\bbeyond\s+the\s+supplied\b/.test(normalized)
  );
}

const MONTHS = new Map(
  [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].map((month, index) => [month, index + 1])
);

function isoDate(year: number, month: number, day: number): string | null {
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(fullYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function explicitMonthDates(rawText: string): Set<string> {
  const dates = new Set<string>();
  const dayFirst =
    /\b(\d{1,2})[\s/-]+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,/-]+(\d{2,4})\b/gi;
  const monthFirst =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s/-]+(\d{1,2})(?:st|nd|rd|th)?[\s,/-]+(\d{2,4})\b/gi;
  for (const match of rawText.matchAll(dayFirst)) {
    const month = MONTHS.get(match[2].slice(0, 3).toLowerCase());
    const date = month ? isoDate(Number(match[3]), month, Number(match[1])) : null;
    if (date) dates.add(date);
  }
  for (const match of rawText.matchAll(monthFirst)) {
    const month = MONTHS.get(match[1].slice(0, 3).toLowerCase());
    const date = month ? isoDate(Number(match[3]), month, Number(match[2])) : null;
    if (date) dates.add(date);
  }
  return dates;
}

/**
 * Resolve numeric dates only when the document itself proves its convention.
 * This catches bundles that mix 01/09/2026 with an unambiguous 01-Sep-26,
 * while leaving genuinely ambiguous documents for human review.
 */
export function reconcileAmbiguousNumericDates(result: ExtractionResult): ExtractionResult {
  const explicitDates = explicitMonthDates(result.raw_text);
  const tokens = [...result.raw_text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g)].map(
    (match) => ({ first: Number(match[1]), second: Number(match[2]), year: Number(match[3]) })
  );
  let dayFirstEvidence = 0;
  let monthFirstEvidence = 0;
  for (const token of tokens) {
    if (token.first > 12 && token.second <= 12) dayFirstEvidence += 1;
    if (token.second > 12 && token.first <= 12) monthFirstEvidence += 1;
    const dmy = isoDate(token.year, token.second, token.first);
    const mdy = isoDate(token.year, token.first, token.second);
    if (dmy && explicitDates.has(dmy) && dmy !== mdy) dayFirstEvidence += 2;
    if (mdy && explicitDates.has(mdy) && dmy !== mdy) monthFirstEvidence += 2;
  }
  if (dayFirstEvidence === monthFirstEvidence) return result;

  const dayFirst = dayFirstEvidence > monthFirstEvidence;
  const corrections = new Map<string, string>();
  for (const token of tokens) {
    if (token.first > 12 || token.second > 12) continue;
    const dmy = isoDate(token.year, token.second, token.first);
    const mdy = isoDate(token.year, token.first, token.second);
    if (!dmy || !mdy || dmy === mdy) continue;
    corrections.set(dayFirst ? mdy : dmy, dayFirst ? dmy : mdy);
  }
  if (corrections.size === 0) return result;

  const reconciled = structuredClone(result);
  const correct = (date: string | null) => (date ? (corrections.get(date) ?? date) : null);
  reconciled.report_date = correct(reconciled.report_date);
  for (const observation of reconciled.observations) {
    observation.report_date = correct(observation.report_date);
  }
  for (const report of reconciled.reports) report.report_date = correct(report.report_date);
  reconciled.warnings = uniqueBy(
    [
      ...reconciled.warnings,
      `Ambiguous numeric dates were normalized as ${dayFirst ? "day/month/year" : "month/day/year"} using unambiguous dates elsewhere in the document.`,
    ],
    (warning) => warning
  );
  return reconciled;
}

/**
 * The same condition often appears on several pages (problem list, impression,
 * discharge summary), so chunked extraction yields near-duplicates. Collapse by
 * condition name and keep the most clinically specific version rather than the
 * first one seen — a later chunk may carry the grade, ICD code or onset date.
 */
export function mergeExtractedDiagnoses(diagnoses: ExtractedDiagnosis[]): ExtractedDiagnosis[] {
  const merged: ExtractedDiagnosis[] = [];
  for (const diagnosis of diagnoses) {
    const key = normalizeConditionName(diagnosis.condition_name);
    if (!key) continue;
    const existing = merged.find(
      (candidate) => normalizeConditionName(candidate.condition_name) === key
    );
    if (!existing) {
      merged.push(structuredClone(diagnosis));
      continue;
    }

    // A hedged mention must never be overwritten by a confident-looking duplicate
    // from another page; keep the most cautious reading.
    existing.certainty = moreCautiousCertainty(existing.certainty, diagnosis.certainty);
    if (existing.clinical_status === "unknown" && diagnosis.clinical_status !== "unknown") {
      existing.clinical_status = diagnosis.clinical_status;
    }
    existing.severity ??= diagnosis.severity;
    existing.body_site ??= diagnosis.body_site;
    existing.icd10_code ??= diagnosis.icd10_code;
    existing.onset_date ??= diagnosis.onset_date;
    existing.recorded_date ??= diagnosis.recorded_date;
    existing.doctor_name ??= diagnosis.doctor_name;
    existing.note ??= diagnosis.note;
    existing.page_number ??= diagnosis.page_number;
    existing.confidence = Math.max(existing.confidence, diagnosis.confidence);
  }
  return merged;
}

export function mergeExtractedReports(reports: ExtractedReport[]): ExtractedReport[] {
  const merged: ExtractedReport[] = [];
  const dateConflicts = new WeakSet<ExtractedReport>();
  for (const report of reports) {
    const existing = merged.find((candidate) => sameReport(candidate, report));
    if (!existing) {
      merged.push(structuredClone(report));
      continue;
    }

    const preferIncomingMetadata = reportDetailScore(report) > reportDetailScore(existing);
    if (
      existing.report_date &&
      report.report_date &&
      existing.report_date !== report.report_date
    ) {
      dateConflicts.add(existing);
      existing.report_date = null;
    } else if (!existing.report_date && report.report_date && !dateConflicts.has(existing)) {
      existing.report_date = report.report_date;
    }
    existing.findings = uniqueBy([...existing.findings, ...report.findings], (value) =>
      value.toLowerCase().replace(/\s+/g, " ").trim()
    );
    existing.measurements = uniqueBy(
      [...existing.measurements, ...report.measurements],
      (measurement) =>
        JSON.stringify([
          measurement.canonical_name ?? measurement.name,
          measurement.value,
          measurement.value_text,
          dedupUnit(measurement.unit),
          measurement.page_number,
        ])
    );
    existing.page_start = Math.min(
      existing.page_start ?? Number.POSITIVE_INFINITY,
      report.page_start ?? Number.POSITIVE_INFINITY
    );
    if (!Number.isFinite(existing.page_start)) existing.page_start = null;
    existing.page_end = Math.max(existing.page_end ?? 0, report.page_end ?? 0) || null;
    existing.summary = longer(existing.summary, report.summary);
    existing.impression = longer(existing.impression, report.impression);
    if (preferIncomingMetadata) {
      existing.facility = report.facility ?? existing.facility;
      existing.doctor_name = report.doctor_name ?? existing.doctor_name;
      existing.body_part = report.body_part ?? existing.body_part;
      existing.modality = report.modality ?? existing.modality;
    }
    existing.follow_up_recommended ||= report.follow_up_recommended;
    existing.confidence = Math.min(existing.confidence, report.confidence);
  }
  return merged.sort(
    (a, b) => (a.page_start ?? Number.MAX_SAFE_INTEGER) - (b.page_start ?? Number.MAX_SAFE_INTEGER)
  );
}

export function mergeExtractionResults(
  results: ExtractionResult[],
  pagesTotal: number
): ExtractionResult {
  const reports = mergeExtractedReports(results.flatMap((result) => result.reports));
  const observationMap = new Map<string, ExtractionResult["observations"][number]>();
  const observationDateConflicts = new Set<string>();
  for (const observation of results.flatMap((result) => result.observations)) {
    const key = JSON.stringify([
      observation.canonical_name ?? observation.test_name,
      observation.value,
      observation.value_text,
      dedupUnit(observation.unit),
      observation.page_number,
    ]);
    const existing = observationMap.get(key);
    if (!existing) {
      observationMap.set(key, structuredClone(observation));
      continue;
    }
    if (
      existing.report_date &&
      observation.report_date &&
      existing.report_date !== observation.report_date
    ) {
      existing.report_date = null;
      observationDateConflicts.add(key);
    } else if (
      !existing.report_date &&
      observation.report_date &&
      !observationDateConflicts.has(key)
    ) {
      existing.report_date = observation.report_date;
    }
    existing.confidence = Math.min(existing.confidence, observation.confidence);
  }
  const observations = [...observationMap.values()];
  const coveredPages = new Set<number>();
  for (const observation of observations) {
    if (observation.page_number) coveredPages.add(observation.page_number);
  }
  for (const report of reports) {
    if (report.page_start && report.page_end) {
      for (let page = report.page_start; page <= report.page_end; page += 1) coveredPages.add(page);
    }
  }
  const unmatchedPages = Array.from({ length: pagesTotal }, (_, index) => index + 1).filter(
    (page) => !coveredPages.has(page)
  );
  const detectedDocumentTypes = new Set(results.map((result) => result.document_type));
  const documentType =
    detectedDocumentTypes.size === 1 ? results[0].document_type : ("other" as const);
  const documentDates = new Set(
    results.map((result) => result.report_date).filter((date): date is string => Boolean(date))
  );
  const reportDateConflicts = reports
    .filter((report) => report.report_date === null)
    .filter((report) => {
      const sourceDates = new Set(
        results
          .flatMap((result) => result.reports)
          .filter(
            (candidate) =>
              normalizedReportName(candidate) === normalizedReportName(report) &&
              pageRangesTouch(candidate, report)
          )
          .map((candidate) => candidate.report_date)
          .filter((date): date is string => Boolean(date))
      );
      return sourceDates.size > 1;
    })
    .map((report) => `Conflicting dates were extracted for ${report.study_name}; date left unset.`);

  return {
    document_type: documentType,
    report_date: documentDates.size === 1 ? [...documentDates][0] : null,
    lab_name: results.find((result) => result.lab_name)?.lab_name ?? null,
    patient_name: results.find((result) => result.patient_name)?.patient_name ?? null,
    raw_text: results
      .map((result, index) => `[Extraction chunk ${index + 1}]\n${result.raw_text}`)
      .join("\n\n"),
    observations,
    diagnoses: mergeExtractedDiagnoses(results.flatMap((result) => result.diagnoses ?? [])),
    reports,
    medications: uniqueBy(results.flatMap((result) => result.medications), JSON.stringify),
    genetic_report: results.find((result) => result.genetic_report)?.genetic_report ?? null,
    genetic_variants: uniqueBy(
      results.flatMap((result) => result.genetic_variants),
      JSON.stringify
    ),
    genetic_risks: uniqueBy(results.flatMap((result) => result.genetic_risks), JSON.stringify),
    pharmacogenomics: uniqueBy(
      results.flatMap((result) => result.pharmacogenomics),
      JSON.stringify
    ),
    coverage: {
      pages_total: pagesTotal,
      pages_processed: pagesTotal,
      sections_detected: reports.length + (observations.length > 0 ? 1 : 0),
      sections_extracted: reports.length + (observations.length > 0 ? 1 : 0),
      unmatched_pages: unmatchedPages,
    },
    warnings: uniqueBy(
      [
        ...results
          .flatMap((result) => result.warnings)
          .filter((warning) => !isInternalChunkNotice(warning))
          // Only suppress a "pages were not supplied" claim when merged coverage
          // proves otherwise. If pages really are unrepresented the warning is
          // genuine and must survive.
          .filter(
            (warning) => !(unmatchedPages.length === 0 && claimsUnsuppliedPages(warning))
          ),
        ...reportDateConflicts,
        ...(observationDateConflicts.size > 0
          ? ["Conflicting dates were extracted for one or more observations; those dates were left unset."]
          : []),
        ...(documentDates.size > 1
          ? ["Multiple document-level dates were extracted; the shared document date was left unset."]
          : []),
      ],
      (warning) => warning
    ),
    uncertain_items: uniqueBy(
      results
        .flatMap((result) => result.uncertain_items)
        .filter((item) => !isInternalChunkNotice(item)),
      (item) => item
    ),
  };
}

/**
 * Builds a single chunk covering one absolute page range, labelled with the same
 * provenance markers as a normal split so extracted page numbers stay absolute.
 * Used for a targeted re-read when the first pass under-extracted a table.
 */
export async function buildPageRangeChunk(
  buffer: Buffer,
  pageStart: number,
  pageEnd: number
): Promise<Chunk> {
  const source = await PDFDocument.load(buffer);
  const pagesTotal = source.getPageCount();
  const from = Math.max(1, Math.min(pageStart, pagesTotal));
  const to = Math.max(from, Math.min(pageEnd, pagesTotal));

  const output = await PDFDocument.create();
  const provenanceFont = await output.embedFont(StandardFonts.Helvetica);
  const copied = await output.copyPages(
    source,
    Array.from({ length: to - from + 1 }, (_, index) => from - 1 + index)
  );
  for (const [index, page] of copied.entries()) {
    page.drawText(`HEARTH SOURCE PAGE ${from + index} OF ${pagesTotal}`, {
      x: 8,
      y: Math.max(4, page.getHeight() - 9),
      size: 6,
      font: provenanceFont,
      color: rgb(0.45, 0.45, 0.45),
      opacity: 0.8,
    });
    output.addPage(page);
  }
  return {
    buffer: Buffer.from(await output.save()),
    pageStart: from,
    pageEnd: to,
    pagesTotal,
  };
}

const EXHAUSTIVE_TABLE_FOCUS =
  "This is a targeted re-read: an earlier pass under-extracted this page. " +
  "Transcribe EVERY populated cell of every table here as a separate measurement, " +
  "including predicted, LLN, percent-predicted, percent-change and other derived " +
  "columns. Do not omit a value because it repeats or looks secondary. Return only " +
  "what is printed on these pages.";

/** Re-reads a page range with an exhaustive-table instruction. */
export async function extractPagesWithOpenAI(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  documentTypeHint: string;
  pageStart: number;
  pageEnd: number;
  signal?: AbortSignal;
}): Promise<ProviderOutput> {
  if (input.mimeType !== "application/pdf") {
    throw new Error("Targeted page re-extraction supports PDF documents only");
  }
  const client = new OpenAI();
  const model = extractionModel();
  const chunk = await buildPageRangeChunk(input.buffer, input.pageStart, input.pageEnd);
  const output = await extractChunkWithOpenAI({
    client,
    model,
    chunk,
    mimeType: input.mimeType,
    filename: input.filename,
    documentTypeHint: input.documentTypeHint,
    signal: input.signal,
    focus: EXHAUSTIVE_TABLE_FOCUS,
  });
  return {
    ...output,
    engine: `${output.engine}:page-${chunk.pageStart}-${chunk.pageEnd}`,
  };
}

async function splitPdf(buffer: Buffer): Promise<Chunk[]> {
  const source = await PDFDocument.load(buffer);
  const pagesTotal = source.getPageCount();
  const chunks: Chunk[] = [];
  const advance = PDF_CHUNK_PAGES - PDF_CHUNK_OVERLAP;
  for (let start = 0; start < pagesTotal; start += advance) {
    const end = Math.min(start + PDF_CHUNK_PAGES, pagesTotal);
    const output = await PDFDocument.create();
    const provenanceFont = await output.embedFont(StandardFonts.Helvetica);
    const copied = await output.copyPages(
      source,
      Array.from({ length: end - start }, (_, index) => start + index)
    );
    for (const [index, page] of copied.entries()) {
      page.drawText(`HEARTH SOURCE PAGE ${start + index + 1} OF ${pagesTotal}`, {
        x: 8,
        y: Math.max(4, page.getHeight() - 9),
        size: 6,
        font: provenanceFont,
        color: rgb(0.45, 0.45, 0.45),
        opacity: 0.8,
      });
      output.addPage(page);
    }
    chunks.push({
      buffer: Buffer.from(await output.save()),
      pageStart: start + 1,
      pageEnd: end,
      pagesTotal,
    });
    if (end === pagesTotal) break;
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  task: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function extractChunkWithOpenAI({
  client,
  model,
  chunk,
  mimeType,
  filename,
  documentTypeHint,
  signal,
  focus,
}: {
  client: OpenAI;
  model: string;
  chunk: Chunk;
  mimeType: string;
  filename: string;
  documentTypeHint: string;
  signal?: AbortSignal;
  /** Extra instruction for a targeted re-read of pages the first pass under-extracted. */
  focus?: string;
}): Promise<ProviderOutput> {
  const filePart =
    mimeType === "application/pdf"
      ? {
          type: "input_file" as const,
          filename: filename || "document.pdf",
          file_data: `data:application/pdf;base64,${chunk.buffer.toString("base64")}`,
        }
      : {
          type: "input_image" as const,
          image_url: `data:${mimeType};base64,${chunk.buffer.toString("base64")}`,
          detail: "high" as const,
        };

  const response = await client.responses.create(
    {
      model,
      instructions: SYSTEM_PROMPT,
      max_output_tokens: 16000,
      reasoning: { effort: "low" },
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Uploaded document type hint: ${documentTypeHint}. ` +
                `This input contains original document pages ${chunk.pageStart}-${chunk.pageEnd} ` +
                `of ${chunk.pagesTotal}. Use those absolute page numbers in all provenance fields. ` +
                "Extract every report and measurement from these pages and return the strict JSON only." +
                (focus ? ` ${focus}` : ""),
            },
            filePart,
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "medical_extraction_v3",
          schema: OPENAI_JSON_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    },
    { maxRetries: 1, signal, timeout: 240_000 }
  );

  const result = extractionResultSchema.parse(JSON.parse(response.output_text));
  return {
    result,
    model,
    promptVersion: PROMPT_VERSION,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    engine: `openai:${model}`,
  };
}

export async function extractWithOpenAI(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  documentTypeHint: string;
  signal?: AbortSignal;
}): Promise<ProviderOutput> {
  const client = new OpenAI();
  const model = extractionModel();
  const chunks =
    input.mimeType === "application/pdf"
      ? await splitPdf(input.buffer)
      : [{ buffer: input.buffer, pageStart: 1, pageEnd: 1, pagesTotal: 1 }];
  const outputs = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, (chunk) =>
    extractChunkWithOpenAI({
      client,
      model,
      chunk,
      mimeType: input.mimeType,
      filename: input.filename,
      documentTypeHint: input.documentTypeHint,
      signal: input.signal,
    })
  );
  const inputTokens = outputs.reduce((sum, output) => sum + (output.inputTokens ?? 0), 0);
  const outputTokens = outputs.reduce((sum, output) => sum + (output.outputTokens ?? 0), 0);

  return {
    result: reconcileAmbiguousNumericDates(
      mergeExtractionResults(
        outputs.map((output) => output.result),
        chunks[0].pagesTotal
      )
    ),
    model,
    promptVersion: PROMPT_VERSION,
    inputTokens: outputs.some((output) => output.inputTokens != null) ? inputTokens : null,
    outputTokens: outputs.some((output) => output.outputTokens != null) ? outputTokens : null,
    engine: `openai:${model}${chunks.length > 1 ? `:chunked-${chunks.length}` : ""}`,
  };
}
