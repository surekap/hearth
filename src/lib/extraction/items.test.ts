import { describe, expect, it } from "vitest";
import { extractionItemsFromResult } from "./items";
import type { ExtractionResult } from "./schemas";

function result(): ExtractionResult {
  return {
    document_type: "other",
    report_date: "2026-09-01",
    lab_name: null,
    patient_name: null,
    raw_text: "[Page 1] Echocardiogram",
    observations: [],
    diagnoses: [],
    reports: [
      {
        study_name: "Echocardiogram",
        report_type: "procedure",
        report_date: "2026-09-01",
        modality: "2D echo",
        body_part: "Heart",
        specialty: "Cardiology",
        facility: null,
        doctor_name: null,
        findings: ["Good LV function."],
        impression: "Normal systolic function.",
        summary: null,
        follow_up_recommended: false,
        page_start: 1,
        page_end: 2,
        measurements: [
          {
            name: "EF",
            canonical_name: "Left Ventricular Ejection Fraction",
            value: 66,
            value_text: null,
            unit: "%",
            reference_low: null,
            reference_high: null,
            interpretation: "unknown",
            category: "cardiac",
            page_number: 1,
            confidence: 0.99,
          },
        ],
        confidence: 0.99,
      },
    ],
    medications: [],
    genetic_report: null,
    genetic_variants: [],
    genetic_risks: [],
    pharmacogenomics: [],
    coverage: {
      pages_total: 2,
      pages_processed: 2,
      sections_detected: 1,
      sections_extracted: 1,
      unmatched_pages: [],
    },
    warnings: [],
    uncertain_items: [],
  };
}

describe("extractionItemsFromResult", () => {
  it("creates one report item and separate diagnostic measurement items", () => {
    const items = extractionItemsFromResult({
      result: result(),
      jobId: "00000000-0000-4000-8000-000000000001",
      profileId: "00000000-0000-4000-8000-000000000002",
    });

    expect(items.map((item) => item.itemType)).toEqual([
      "report_summary",
      "diagnostic_measurement",
    ]);
    expect(items[1].rawJson).toMatchObject({
      test_name: "EF",
      study_name: "Echocardiogram",
      page_number: 1,
    });
  });

  it("keeps an observation's page-level date instead of the document-level date", () => {
    const input = result();
    input.report_date = "2026-01-09";
    input.observations = [
      {
        test_name: "ALT",
        canonical_name: "ALT",
        report_date: "2026-09-01",
        value: 42,
        value_text: null,
        unit: "U/L",
        reference_low: null,
        reference_high: 45,
        interpretation: "normal",
        page_number: 3,
        confidence: 0.99,
      },
    ];

    const items = extractionItemsFromResult({
      result: input,
      jobId: "00000000-0000-4000-8000-000000000001",
      profileId: "00000000-0000-4000-8000-000000000002",
    });

    expect(items[0].rawJson).toMatchObject({ report_date: "2026-09-01" });
  });
});
