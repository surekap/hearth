import { describe, expect, it } from "vitest";
import {
  isImplausibleMetricObservation,
  normalizeMetricRecord,
} from "./normalization";

describe("normalizeMetricRecord", () => {
  it("rescales known Apple Health fractional percentages", () => {
    expect(
      normalizeMetricRecord({
        metric: "Oxygen Saturation",
        normalUnit: "%",
        unit: "%",
        valueNumeric: 0.948,
      })
    ).toMatchObject({ unit: "%", valueNumeric: 94.8 });
  });

  it("normalizes WBC cells per cubic millimeter to thousands per microliter", () => {
    expect(
      normalizeMetricRecord({
        metric: "WBC Count",
        normalUnit: "10³/µL",
        unit: "cells/cu.mm",
        valueNumeric: 7190,
        referenceLow: 4000,
        referenceHigh: 10000,
      })
    ).toMatchObject({
      unit: "10³/µL",
      valueNumeric: 7.19,
      referenceLow: 4,
      referenceHigh: 10,
    });
  });

  it("normalizes platelet cells per cubic millimeter to thousands per microliter", () => {
    expect(
      normalizeMetricRecord({
        metric: "Platelet Count",
        normalUnit: "10³/µL",
        unit: "cells/cu.mm",
        valueNumeric: 301000,
        referenceLow: 150000,
        referenceHigh: 410000,
      })
    ).toMatchObject({
      unit: "10³/µL",
      valueNumeric: 301,
      referenceLow: 150,
      referenceHigh: 410,
    });
  });

  it("normalizes label-only count mismatches without changing value", () => {
    expect(
      normalizeMetricRecord({
        metric: "Absolute Lymphocyte Count",
        normalUnit: "cells/µL",
        unit: "Cells/cu.mm",
        valueNumeric: 1725.6,
      })
    ).toMatchObject({ unit: "cells/µL", valueNumeric: 1725.6 });
    expect(
      normalizeMetricRecord({
        metric: "RBC Count",
        normalUnit: "10⁶/µL",
        unit: "Million/cu.mm",
        valueNumeric: 5.73,
      })
    ).toMatchObject({ unit: "10⁶/µL", valueNumeric: 5.73 });
  });

  it("keeps ordinary percentages untouched", () => {
    expect(
      normalizeMetricRecord({
        metric: "Basophils",
        normalUnit: "%",
        unit: "%",
        valueNumeric: 0.5,
      })
    ).toMatchObject({ unit: "%", valueNumeric: 0.5 });
  });
});

describe("isImplausibleMetricObservation", () => {
  it("flags impossible non-positive body composition values", () => {
    expect(isImplausibleMetricObservation("Body Fat Percentage", 0)).toBe(true);
    expect(isImplausibleMetricObservation("Lean Body Mass", 0)).toBe(true);
  });

  it("allows zero values for metrics where zero is valid", () => {
    expect(isImplausibleMetricObservation("Basophils", 0)).toBe(false);
  });
});
