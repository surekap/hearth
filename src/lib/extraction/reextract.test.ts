import { describe, expect, it } from "vitest";
import { newMeasurementsOnly } from "./items";

type Row = { itemType: string; rawJson: Record<string, unknown> };

function lab(overrides: Partial<Record<string, unknown>> = {}): Row {
  return {
    itemType: "lab_observation",
    rawJson: {
      test_name: "FEV1",
      canonical_name: "FEV1",
      value: 3.2,
      value_text: null,
      unit: "L",
      page_number: 5,
      confidence: 0.9,
      ...overrides,
    },
  };
}

describe("newMeasurementsOnly", () => {
  it("drops a row the job already has", () => {
    expect(newMeasurementsOnly([lab()], [lab()])).toHaveLength(0);
  });

  it("keeps a genuinely new value from the same page", () => {
    const fresh = newMeasurementsOnly(
      [lab({ test_name: "FEV1 % predicted", canonical_name: "FEV1 % predicted", value: 88 })],
      [lab()]
    );
    expect(fresh).toHaveLength(1);
  });

  it("treats the same test on a different page as distinct", () => {
    expect(newMeasurementsOnly([lab({ page_number: 6 })], [lab()])).toHaveLength(1);
  });

  it("ignores confidence drift between passes", () => {
    expect(newMeasurementsOnly([lab({ confidence: 0.42 })], [lab()])).toHaveLength(0);
  });

  it("matches across name casing", () => {
    expect(
      newMeasurementsOnly([lab({ canonical_name: "fev1", test_name: "fev1" })], [lab()])
    ).toHaveLength(0);
  });

  // Deliberate asymmetry: separators are normalised to a space rather than
  // stripped, so "fev-1" and "FEV1" read as different tests. Matching too
  // loosely would silently drop a genuinely new measurement, which is the worse
  // failure — a surplus row is visible and rejectable, a missing one is not.
  it("prefers a surplus row over dropping a possibly-distinct test", () => {
    expect(
      newMeasurementsOnly([lab({ canonical_name: "fev-1", test_name: "fev-1" })], [lab()])
    ).toHaveLength(1);
  });

  it("matches across unit spacing", () => {
    expect(newMeasurementsOnly([lab({ unit: " L " })], [lab()])).toHaveLength(0);
  });

  it("does not return duplicates within the re-read itself", () => {
    expect(newMeasurementsOnly([lab(), lab()], [])).toHaveLength(1);
  });

  it("only returns measurements, never reports or medications", () => {
    const rows = [
      { itemType: "report_summary", rawJson: { study_name: "Spirometry" } },
      { itemType: "medication", rawJson: { brand_name: "Mounjaro" } },
      lab({ value: 9.9 }),
    ];
    const fresh = newMeasurementsOnly(rows, []);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].itemType).toBe("lab_observation");
  });

  it("uses diagnostic_measurement name field too", () => {
    const existing = [
      { itemType: "diagnostic_measurement", rawJson: { name: "BMD", value: 1.1, unit: "g/cm2", page_number: 2 } },
    ];
    const candidate = [
      { itemType: "diagnostic_measurement", rawJson: { name: "BMD", value: 1.1, unit: "g/cm2", page_number: 2 } },
    ];
    expect(newMeasurementsOnly(candidate, existing)).toHaveLength(0);
  });
});
