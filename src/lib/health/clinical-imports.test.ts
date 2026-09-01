import { describe, expect, it } from "vitest";
import { buildClinicalImportBatches } from "./clinical-imports";

describe("buildClinicalImportBatches", () => {
  it("surfaces every clinical date in a newly ingested mixed report", () => {
    const ingestedAt = new Date("2026-09-01T17:40:00.000Z");
    const batches = buildClinicalImportBatches({
      documents: [
        {
          id: "doc-1",
          filename: "health-check.pdf",
          documentDate: "2026-09-01",
          uploadedAt: ingestedAt,
        },
      ],
      observations: [
        {
          documentId: "doc-1",
          observedAt: new Date("2026-01-09T00:00:00.000Z"),
          createdAt: ingestedAt,
          name: "Hemoglobin",
          category: "hematology",
          valueNumeric: 15.7,
          valueText: null,
          unit: "g/dL",
          interpretation: "normal",
        },
        {
          documentId: "doc-1",
          observedAt: new Date("2026-09-01T00:00:00.000Z"),
          createdAt: ingestedAt,
          name: "New Vendor Bone Score",
          category: "other",
          valueNumeric: -0.3,
          valueText: null,
          unit: "SD",
          interpretation: "normal",
        },
      ],
      reports: [
        {
          documentId: "doc-1",
          reportDate: "2026-09-01",
          createdAt: ingestedAt,
          studyName: "Bone Densitometry Report",
          reportType: "imaging",
        },
      ],
      images: [{ documentId: "doc-1", reportDate: "2026-09-01", createdAt: ingestedAt }],
    });

    expect(batches.map((batch) => batch.date).sort()).toEqual(["2026-01-09", "2026-09-01"]);
    expect(batches[0].date).toBe("2026-09-01");
    expect(batches.find((batch) => batch.date === "2026-09-01")).toMatchObject({
      title: "Bone Densitometry Report",
      measurementCount: 1,
      labMeasurementCount: 1,
      reportCount: 1,
      imageCount: 1,
    });
  });
});
