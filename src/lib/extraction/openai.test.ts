import { describe, expect, it } from "vitest";
import { mergeExtractionResults, reconcileAmbiguousNumericDates } from "./openai";
import type { ExtractionResult } from "./schemas";

function chunk(page: number, finding: string): ExtractionResult {
  return {
    document_type: "specialist_report",
    report_date: "2026-09-01",
    lab_name: null,
    patient_name: null,
    raw_text: `[Page ${page}] ${finding}`,
    observations: [],
    diagnoses: [],
    reports: [
      {
        study_name: "2D Echocardiogram Report",
        report_type: "procedure",
        report_date: page === 1 ? "2026-01-09" : "2026-09-01",
        modality: page === 1 ? "Echocardiogram" : "Cardiac ultrasound",
        body_part: "Heart",
        specialty: "Cardiology",
        facility: null,
        doctor_name: null,
        findings: [finding],
        impression: page === 2 ? "Good LV function." : null,
        summary: null,
        follow_up_recommended: false,
        page_start: page,
        page_end: page,
        measurements: [],
        confidence: 0.98,
      },
    ],
    medications: [],
    genetic_report: null,
    genetic_variants: [],
    genetic_risks: [],
    pharmacogenomics: [],
    coverage: {
      pages_total: 2,
      pages_processed: 1,
      sections_detected: 1,
      sections_extracted: 1,
      unmatched_pages: [],
    },
    warnings:
      page === 1
        ? [
            "The supplied pages are original document pages 1-1 of a 2-page document.",
            "A measurement is unreadable.",
          ]
        : [],
    uncertain_items: [],
  };
}

describe("mergeExtractionResults", () => {
  it("merges the same report across page chunks and reconciles coverage", () => {
    const result = mergeExtractionResults([chunk(1, "Valve findings"), chunk(2, "Conclusion")], 2);

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]).toMatchObject({
      page_start: 1,
      page_end: 2,
      findings: ["Valve findings", "Conclusion"],
      impression: "Good LV function.",
      report_date: null,
    });
    expect(result.coverage).toMatchObject({
      pages_total: 2,
      pages_processed: 2,
      unmatched_pages: [],
    });
    expect(result.warnings).toEqual([
      "A measurement is unreadable.",
      "Conflicting dates were extracted for 2D Echocardiogram Report; date left unset.",
    ]);
  });

  it("uses an unambiguous spelled date to resolve numeric day/month dates", () => {
    const result = chunk(1, "Reporting date: 01/09/2026. VAT date: 01-Sep-26.");
    result.report_date = "2026-01-09";
    result.reports[0].report_date = "2026-01-09";
    result.observations = [
      {
        test_name: "ALT",
        canonical_name: "ALT",
        report_date: "2026-01-09",
        value: 42,
        value_text: null,
        unit: "U/L",
        reference_low: null,
        reference_high: 45,
        interpretation: "normal",
        page_number: 1,
        confidence: 0.99,
      },
    ];

    const reconciled = reconcileAmbiguousNumericDates(result);

    expect(reconciled.report_date).toBe("2026-09-01");
    expect(reconciled.reports[0].report_date).toBe("2026-09-01");
    expect(reconciled.observations[0].report_date).toBe("2026-09-01");
  });

  it("deduplicates overlapping observations whose micro symbols differ", () => {
    const first = chunk(12, "TSH");
    const second = structuredClone(first);
    first.reports = [];
    second.reports = [];
    first.observations = [
      {
        test_name: "Thyroid Stimulating Hormone (TSH)",
        canonical_name: "TSH",
        report_date: "2026-09-01",
        value: 0.82,
        value_text: null,
        unit: "µIU/mL",
        reference_low: 0.4,
        reference_high: 4.049,
        interpretation: "normal",
        page_number: 12,
        confidence: 0.99,
      },
    ];
    second.observations = [{ ...first.observations[0], unit: "μIU/mL" }];

    const result = mergeExtractionResults([first, second], 12);

    expect(result.observations).toHaveLength(1);
  });
});
