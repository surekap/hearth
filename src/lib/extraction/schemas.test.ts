import { describe, expect, it } from "vitest";
import { extractionResultSchema } from "./schemas";

describe("extractionResultSchema", () => {
  it("upgrades a v2 single report into the v3 multi-report contract", () => {
    const result = extractionResultSchema.parse({
      document_type: "imaging",
      report_date: "2026-09-01",
      lab_name: null,
      lab_country: null,
      patient_name: null,
      raw_text: "Chest radiograph",
      observations: [],
      report: {
        modality: "X-ray",
        body_part: "Chest",
        specialty: "Radiology",
        facility: null,
        doctor_name: null,
        findings: ["Lungs are clear."],
        impression: "Normal chest radiograph.",
        summary: null,
        follow_up_recommended: false,
        confidence: 0.98,
      },
      medications: [],
      genetic_report: null,
      genetic_variants: [],
      genetic_risks: [],
      pharmacogenomics: [],
      warnings: [],
      uncertain_items: [],
    });

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]).toMatchObject({
      study_name: "X-ray",
      report_type: "other",
      report_date: "2026-09-01",
      measurements: [],
    });
    expect(result.coverage.pages_total).toBe(1);
  });
});
