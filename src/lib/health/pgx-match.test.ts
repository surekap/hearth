import { describe, expect, it } from "vitest";
import { matchPharmacogenomics } from "./pgx-match";

const results = [
  { drugName: "Clopidogrel", gene: "CYP2C19", phenotype: "Poor metabolizer", implication: "Reduced activation", actionability: "high_impact", recommendationSummary: "Consider alternative." },
  { drugName: "Simvastatin", gene: "SLCO1B1", phenotype: null, implication: "Myopathy risk", actionability: "informational", recommendationSummary: null },
];

describe("matchPharmacogenomics", () => {
  it("matches the drug as a whole word inside the medication name", () => {
    expect(matchPharmacogenomics("Clopidogrel 75 mg", results)).toHaveLength(1);
    expect(matchPharmacogenomics("Metformin 500mg", results)).toEqual([]);
  });

  it("only surfaces results that call for action", () => {
    expect(matchPharmacogenomics("Simvastatin 20mg", results)).toEqual([]);
  });
});
