import { describe, expect, it } from "vitest";
import { inferClinicalImageKind } from "./clinical-image-metadata";
import type { ExtractedReport } from "./schemas";

function report(studyName: string, modality: string | null = null): ExtractedReport {
  return {
    study_name: studyName,
    report_type: "imaging",
    report_date: null,
    modality,
    body_part: null,
    specialty: null,
    facility: null,
    doctor_name: null,
    findings: [],
    impression: null,
    summary: null,
    follow_up_recommended: false,
    page_start: 1,
    page_end: 1,
    measurements: [],
    confidence: 1,
  };
}

describe("inferClinicalImageKind", () => {
  it("recognizes DEXA and body composition reports", () => {
    expect(inferClinicalImageKind(report("Bone Densitometry Report"))).toBe("dexa");
    expect(inferClinicalImageKind(report("Body Composition", "Lunar Prodigy"))).toBe("dexa");
  });

  it("recognizes retinal and ultrasound studies", () => {
    expect(inferClinicalImageKind(report("Left retinal fundus scan"))).toBe("retinal");
    expect(inferClinicalImageKind(report("Abdominal Ultrasound"))).toBe("ultrasound");
  });
});
