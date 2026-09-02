import { describe, expect, it } from "vitest";
import { tryRuleAnswer } from "./rules";
import { summarizeChanges } from "./changes";
import type { AiContext } from "./context";

function obs(test: string, date: string, value: number, hi: number): AiContext["observations"][number] {
  return {
    test,
    category: "metabolic",
    date,
    value,
    unit: "mg/dL",
    referenceLow: null,
    referenceHigh: hi,
    interpretation: value > hi ? "high" : "normal",
  };
}

function contextWith(observations: AiContext["observations"]): AiContext {
  return {
    profile: { relationship: "self", ageYears: 40, sexAtBirth: "male" },
    observations,
    changes: summarizeChanges(observations, { windowMonths: 6, now: new Date("2026-09-02") }),
    diagnoses: [],
    reports: [],
    healthRollups: [],
    healthEvents: [],
    genomics: { reports: [], risks: [], pharmacogenomics: [] },
    patientReported: [],
    timeRange: { from: observations[0]?.date ?? null, to: observations.at(-1)?.date ?? null },
  };
}

describe("tryRuleAnswer — what changed", () => {
  const context = contextWith([
    obs("Triglycerides", "2026-02-15", 220, 150),
    obs("ALT", "2026-01-10", 30, 45),
    obs("ALT", "2026-08-20", 67, 45),
    obs("Triglycerides", "2026-08-20", 140, 150),
    obs("HbA1c", "2026-08-20", 5.6, 5.7),
  ]);

  it("answers an improved/worse question without the model", () => {
    const result = tryRuleAnswer("What has improved and what has gotten worse in the last 6 months?", context);
    expect(result?.model).toBe("rules-engine");
    expect(result?.answer).toContain("Getting worse (1)");
    expect(result?.answer).toContain("ALT: 30 → 67");
    expect(result?.answer).toContain("Improved (1)");
    expect(result?.answer).toContain("Triglycerides: 220 → 140");
    expect(result?.answer).toContain("not comparable: HbA1c");
  });

  it("recomputes for a different window named in the question", () => {
    const result = tryRuleAnswer("What got worse over the last month?", context);
    expect(result?.answer).toContain("the last month");
    // The one August reading is compared with the last reading before the window.
    expect(result?.answer).toContain("ALT: 30 → 67");
    expect(result?.answer).toContain("since 2026-08-02");
  });

  it("still routes a single-test trend question to the trend handler", () => {
    const result = tryRuleAnswer("How has my ALT trended?", context);
    expect(result?.answer).toContain("ALT has risen");
  });
});
