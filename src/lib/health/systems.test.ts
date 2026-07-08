import { describe, expect, it } from "vitest";
import { SYSTEMS, categoryLabel, metricBelongsTo, systemFor } from "./systems";

describe("registry", () => {
  it("has unique ids and exposes lookups", () => {
    const ids = SYSTEMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(systemFor("cardiovascular")?.title).toBe("Heart & circulation");
    expect(systemFor("nope")).toBeUndefined();
  });
});

describe("metricBelongsTo", () => {
  it("matches by category", () => {
    const cardio = systemFor("cardiovascular")!;
    expect(metricBelongsTo(cardio, { category: "lipid", name: "LDL" })).toBe(true);
    expect(metricBelongsTo(cardio, { category: "sleep", name: "Sleep Duration" })).toBe(false);
  });
  it("matches bone metrics by name since they live in the body category", () => {
    const bone = systemFor("bone")!;
    expect(metricBelongsTo(bone, { category: "body", name: "DEXA total body T-score" })).toBe(true);
    expect(metricBelongsTo(bone, { category: "body", name: "Weight" })).toBe(false);
  });
});

describe("categoryLabel", () => {
  it("uses known labels and titleizes unknown ones", () => {
    expect(categoryLabel("hematology")).toBe("Blood counts");
    expect(categoryLabel("tumor_marker")).toBe("Cancer screening");
    expect(categoryLabel("made_up_thing")).toBe("Made Up Thing");
  });
});
