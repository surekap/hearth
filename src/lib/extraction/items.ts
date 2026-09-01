import type { schema } from "@/db";
import type { ExtractionResult } from "./schemas";

type ExtractedItemInsert = typeof schema.extractedItems.$inferInsert;

/**
 * Identity of a measurement for dedupe purposes: what it is, what it reads, and
 * where it came from. Deliberately excludes confidence and free text, which vary
 * between passes over the same printed value.
 */
function measurementKey(raw: Record<string, unknown>): string {
  const name = (raw.canonical_name ?? raw.test_name ?? raw.name ?? "") as string;
  const unit = (raw.unit ?? "") as string;
  return JSON.stringify([
    String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    raw.value ?? null,
    raw.value_text ?? null,
    String(unit).toLowerCase().replace(/\s+/g, ""),
    raw.page_number ?? null,
  ]);
}

/**
 * Filters a targeted re-read down to rows the job does not already have.
 *
 * A re-read of a page necessarily returns everything printed on it, including
 * what the first pass captured. Without this the review screen would fill with
 * duplicates of values the user already accepted.
 */
export function newMeasurementsOnly<T extends { itemType: string; rawJson: unknown }>(
  candidates: T[],
  existing: { itemType: string; rawJson: unknown }[]
): T[] {
  const seen = new Set(
    existing
      .filter((item) => MEASUREMENT_TYPES.has(item.itemType))
      .map((item) => measurementKey(item.rawJson as Record<string, unknown>))
  );
  const out: T[] = [];
  for (const candidate of candidates) {
    if (!MEASUREMENT_TYPES.has(candidate.itemType)) continue;
    const key = measurementKey(candidate.rawJson as Record<string, unknown>);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

const MEASUREMENT_TYPES = new Set(["lab_observation", "diagnostic_measurement"]);

export function extractionItemsFromResult({
  result,
  jobId,
  profileId,
}: {
  result: ExtractionResult;
  jobId: string;
  profileId: string;
}): ExtractedItemInsert[] {
  const items: ExtractedItemInsert[] = [];

  for (const observation of result.observations) {
    items.push({
      extractionJobId: jobId,
      profileId,
      itemType: "lab_observation",
      status: "draft",
      rawJson: observation,
      confidence: observation.confidence,
    });
  }

  for (const diagnosis of result.diagnoses ?? []) {
    // A ruled-out condition is a useful thing to have read, but confirming it as
    // a record would assert the opposite of what the document says.
    if (diagnosis.certainty === "ruled_out") continue;
    items.push({
      extractionJobId: jobId,
      profileId,
      itemType: "diagnosis",
      status: "draft",
      rawJson: {
        ...diagnosis,
        recorded_date: diagnosis.recorded_date ?? result.report_date,
      },
      confidence: diagnosis.confidence,
    });
  }

  for (const [reportIndex, report] of result.reports.entries()) {
    const reportDate = report.report_date ?? result.report_date;
    items.push({
      extractionJobId: jobId,
      profileId,
      itemType: "report_summary",
      status: "draft",
      rawJson: { ...report, report_index: reportIndex, report_date: reportDate },
      confidence: report.confidence,
    });

    for (const measurement of report.measurements) {
      items.push({
        extractionJobId: jobId,
        profileId,
        itemType: "diagnostic_measurement",
        status: "draft",
        rawJson: {
          ...measurement,
          test_name: measurement.name,
          report_index: reportIndex,
          report_date: reportDate,
          study_name: report.study_name,
          report_type: report.report_type,
          modality: report.modality,
          page_start: report.page_start,
          page_end: report.page_end,
        },
        confidence: measurement.confidence,
      });
    }
  }

  for (const medication of result.medications) {
    items.push({
      extractionJobId: jobId,
      profileId,
      itemType: "medication",
      status: "draft",
      rawJson: { ...medication, report_date: result.report_date },
      confidence: medication.confidence,
    });
  }

  for (const variant of result.genetic_variants) {
    items.push({
      extractionJobId: jobId,
      profileId,
      itemType: "genetic_variant",
      status: "draft",
      rawJson: { ...variant, genetic_report: result.genetic_report, report_date: result.report_date },
      confidence: variant.confidence,
    });
  }

  for (const risk of result.genetic_risks) {
    items.push({
      extractionJobId: jobId,
      profileId,
      itemType: risk.category === "trait" ? "genetic_trait" : "genetic_risk",
      status: "draft",
      rawJson: { ...risk, genetic_report: result.genetic_report, report_date: result.report_date },
      confidence: risk.confidence,
    });
  }

  for (const resultRow of result.pharmacogenomics) {
    items.push({
      extractionJobId: jobId,
      profileId,
      itemType: "pharmacogenomic_result",
      status: "draft",
      rawJson: {
        ...resultRow,
        genetic_report: result.genetic_report,
        report_date: result.report_date,
      },
      confidence: resultRow.confidence,
    });
  }

  return items;
}
