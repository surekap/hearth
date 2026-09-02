import { describe, expect, it } from "vitest";
import { isGenomicsRelevant, scopeGenomics } from "./genomics-relevance";
import type { AiContext } from "./context";

function ctx(drugs: string[]): AiContext {
  return {
    profile: { relationship: "self", ageYears: 40, sexAtBirth: "male" },
    observations: [],
    changes: { windowMonths: 6, since: null, changes: [], singleValueTests: [] },
    diagnoses: [],
    reports: [],
    healthRollups: [],
    healthEvents: [],
    genomics: {
      reports: [{ id: "r", vendor: null, reportName: null, reportDate: null, testKind: "x", summary: null }],
      risks: [],
      pharmacogenomics: drugs.map((drug) => ({
        drug,
        gene: "CYP2C19",
        genotype: null,
        phenotype: null,
        implication: "reduced",
        actionability: "actionable",
        recommendationSummary: null,
      })),
    },
    patientReported: [],
    timeRange: { from: null, to: null },
  };
}

describe("isGenomicsRelevant", () => {
  it("is true for genetic questions and for drugs with pharmacogenomic results", () => {
    expect(isGenomicsRelevant("Do I carry any genetic risk for diabetes?", ctx([]))).toBe(true);
    expect(isGenomicsRelevant("Is clopidogrel safe for me?", ctx(["Clopidogrel"]))).toBe(true);
    expect(isGenomicsRelevant("Any warnings about my medications?", ctx(["Clopidogrel"]))).toBe(true);
  });

  it("is false for everyday lab questions", () => {
    expect(isGenomicsRelevant("What has improved in the last 6 months?", ctx(["Clopidogrel"]))).toBe(false);
    expect(isGenomicsRelevant("Any warnings about my medications?", ctx([]))).toBe(false);
  });
});

describe("scopeGenomics", () => {
  it("empties genomics for unrelated questions and keeps it otherwise", () => {
    const context = ctx(["Warfarin"]);
    expect(scopeGenomics("How is my ALT?", context).genomics.reports).toEqual([]);
    expect(scopeGenomics("Should I worry about warfarin?", context).genomics.pharmacogenomics).toHaveLength(1);
  });
});
