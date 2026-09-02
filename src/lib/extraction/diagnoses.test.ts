import { describe, expect, it } from "vitest";
import { mergeExtractedDiagnoses } from "./openai";
import { extractionItemsFromResult } from "./items";
import { normalizeConditionName, type ExtractedDiagnosis, type ExtractionResult } from "./schemas";

function diagnosis(overrides: Partial<ExtractedDiagnosis> = {}): ExtractedDiagnosis {
  return {
    condition_name: "Fatty liver",
    category: "hepatic",
    clinical_status: "active",
    certainty: "confirmed",
    severity: null,
    body_site: null,
    icd10_code: null,
    onset_date: null,
    recorded_date: null,
    doctor_name: null,
    note: null,
    page_number: 1,
    confidence: 0.9,
    ...overrides,
  };
}

function result(diagnoses: ExtractedDiagnosis[]): ExtractionResult {
  return {
    document_type: "discharge_summary",
    report_date: "2026-09-01",
    lab_name: null,
    lab_country: null,
    patient_name: null,
    raw_text: "[Page 1] Discharge summary",
    observations: [],
    diagnoses,
    reports: [],
    medications: [],
    genetic_report: null,
    genetic_variants: [],
    genetic_risks: [],
    pharmacogenomics: [],
    coverage: {
      pages_total: 1,
      pages_processed: 1,
      sections_detected: 1,
      sections_extracted: 1,
      unmatched_pages: [],
    },
    warnings: [],
    uncertain_items: [],
  };
}

describe("normalizeConditionName", () => {
  it("collapses case and punctuation so duplicates match", () => {
    expect(normalizeConditionName("Type 2 Diabetes Mellitus")).toBe(
      normalizeConditionName("type-2 diabetes mellitus")
    );
  });
});

describe("mergeExtractedDiagnoses", () => {
  it("collapses the same condition seen on several pages", () => {
    const merged = mergeExtractedDiagnoses([
      diagnosis({ page_number: 1 }),
      diagnosis({ condition_name: "FATTY LIVER", page_number: 4 }),
    ]);
    expect(merged).toHaveLength(1);
  });

  it("fills in details a later chunk carries", () => {
    const merged = mergeExtractedDiagnoses([
      diagnosis(),
      diagnosis({ severity: "Grade II", icd10_code: "K76.0", onset_date: "2024-03-01" }),
    ]);
    expect(merged[0]).toMatchObject({
      severity: "Grade II",
      icd10_code: "K76.0",
      onset_date: "2024-03-01",
    });
  });

  it("keeps the most cautious certainty rather than the most confident", () => {
    const merged = mergeExtractedDiagnoses([
      diagnosis({ certainty: "confirmed" }),
      diagnosis({ certainty: "suspected" }),
    ]);
    expect(merged[0].certainty).toBe("suspected");
  });

  it("does not downgrade a genuinely confirmed condition to unknown", () => {
    const merged = mergeExtractedDiagnoses([
      diagnosis({ certainty: "confirmed" }),
      diagnosis({ certainty: "unknown" }),
    ]);
    expect(merged[0].certainty).toBe("confirmed");
  });

  it("drops entries with no usable condition name", () => {
    expect(mergeExtractedDiagnoses([diagnosis({ condition_name: "  " })])).toHaveLength(0);
  });
});

describe("extractionItemsFromResult diagnoses", () => {
  it("emits a draft diagnosis item", () => {
    const items = extractionItemsFromResult({
      result: result([diagnosis()]),
      jobId: "00000000-0000-0000-0000-0000000000aa",
      profileId: "00000000-0000-0000-0000-0000000000bb",
    });
    const diagnosisItems = items.filter((item) => item.itemType === "diagnosis");
    expect(diagnosisItems).toHaveLength(1);
    expect(diagnosisItems[0].status).toBe("draft");
  });

  it("never creates a draft for a ruled-out condition", () => {
    const items = extractionItemsFromResult({
      result: result([diagnosis({ certainty: "ruled_out" })]),
      jobId: "00000000-0000-0000-0000-0000000000aa",
      profileId: "00000000-0000-0000-0000-0000000000bb",
    });
    expect(items.filter((item) => item.itemType === "diagnosis")).toHaveLength(0);
  });

  it("falls back to the document date when the condition has no recorded date", () => {
    const items = extractionItemsFromResult({
      result: result([diagnosis({ recorded_date: null })]),
      jobId: "00000000-0000-0000-0000-0000000000aa",
      profileId: "00000000-0000-0000-0000-0000000000bb",
    });
    const raw = items.find((item) => item.itemType === "diagnosis")?.rawJson as {
      recorded_date?: string;
    };
    expect(raw.recorded_date).toBe("2026-09-01");
  });
});
