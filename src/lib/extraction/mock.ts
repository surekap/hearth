import type { ExtractionResult } from "./schemas";
import type { ProviderOutput } from "./openai";
import { PROMPT_VERSION } from "./schemas";

/**
 * Deterministic mock extraction used when OPENAI_API_KEY is not configured.
 * Returns a realistic Apollo-style metabolic/liver panel so the full
 * upload → review → confirm → dashboard flow can be exercised offline.
 */
export async function extractWithMock(input: {
  filename: string;
  documentDate: string | null;
}): Promise<ProviderOutput> {
  const reportDate = input.documentDate ?? new Date().toISOString().slice(0, 10);

  const rows: Array<
    [string, string | null, number, string, number | null, number | null]
  > = [
    // test_name (as printed), canonical, value, unit, ref_low, ref_high
    ["SGPT (ALT)", "ALT", 67, "U/L", 0, 45],
    ["SGOT (AST)", "AST", 42, "U/L", 0, 40],
    ["GGT", "GGT", 58, "U/L", 0, 55],
    ["Triglycerides", "Triglycerides", 210, "mg/dL", null, 150],
    ["HDL Cholesterol", "HDL", 38, "mg/dL", 40, null],
    ["LDL Cholesterol (Calculated)", "LDL", 131, "mg/dL", null, 100],
    ["Total Cholesterol", "Total Cholesterol", 198, "mg/dL", null, 200],
    ["Glycosylated Hemoglobin (HbA1c)", "HbA1c", 5.9, "%", 4, 5.6],
    ["Fasting Blood Sugar", "Fasting Glucose", 104, "mg/dL", 70, 100],
    ["hs-CRP", "CRP", 3.2, "mg/L", 0, 3],
    ["25-OH Vitamin D", "Vitamin D", 22, "ng/mL", 30, 100],
    ["Serum Uric Acid", "Uric Acid", 7.1, "mg/dL", 3.5, 7.2],
    ["Serum Creatinine", "Creatinine", 0.9, "mg/dL", 0.7, 1.3],
  ];

  const result: ExtractionResult = {
    document_type: "lab_report",
    report_date: reportDate,
    lab_name: "Apollo Diagnostics (MOCK)",
    patient_name: null,
    raw_text: `[MOCK EXTRACTION — set OPENAI_API_KEY for real extraction]\nApollo Diagnostics\nReport date: ${reportDate}\n${rows
      .map(
        ([name, , value, unit, lo, hi]) =>
          `${name}: ${value} ${unit} (ref ${lo ?? ""}-${hi ?? ""})`
      )
      .join("\n")}`,
    observations: rows.map(([test_name, canonical_name, value, unit, lo, hi]) => {
      const interpretation =
        hi != null && value > hi
          ? ("high" as const)
          : lo != null && value < lo
            ? ("low" as const)
            : ("normal" as const);
      return {
        test_name,
        canonical_name,
        value,
        value_text: null,
        unit,
        reference_low: lo,
        reference_high: hi,
        interpretation,
        confidence: 0.95,
      };
    }),
    report: null,
    medications: [],
    warnings: ["Mock extraction provider was used — values are sample data, not from your document."],
    uncertain_items: [],
  };

  return {
    result,
    model: "mock",
    promptVersion: PROMPT_VERSION,
    inputTokens: null,
    outputTokens: null,
    engine: "mock",
  };
}
