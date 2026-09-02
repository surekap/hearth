import { describe, expect, it } from "vitest";
import { tryRuleAnswer } from "./rules";
import { parseAnswer, type ChangeTableBlock } from "./blocks";
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

function changeRows(answer: string | undefined) {
  const block = parseAnswer(answer ?? "").blocks.find((b) => b.type === "change-table") as
    | ChangeTableBlock
    | undefined;
  return block?.rows.map((r) => `${r.test}: ${r.from.value} → ${r.to.value} ${r.direction}`) ?? [];
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
    expect(result?.answer).toContain("Getting worse (1) — ALT");
    expect(result?.answer).toContain("Improved (1) — Triglycerides");
    expect(changeRows(result?.answer)).toEqual([
      "ALT: 30 → 67 worsened",
      "Triglycerides: 220 → 140 improved",
    ]);
    const block = parseAnswer(result!.answer).blocks[0] as ChangeTableBlock;
    expect(block.singleValueTests).toEqual(["HbA1c"]);
  });

  it("recomputes for a different window named in the question", () => {
    const result = tryRuleAnswer("What got worse over the last month?", context);
    expect(result?.answer).toContain("the last month");
    // The January reading is recent enough to serve as the baseline.
    expect(changeRows(result?.answer)).toContain("ALT: 30 → 67 worsened");
  });

  it("still routes a single-test trend question to the trend handler", () => {
    const result = tryRuleAnswer("How has my ALT trended?", context);
    expect(result?.answer).toContain("ALT has risen");
  });
});

describe("tryRuleAnswer — broad change question that mentions one test in passing", () => {
  const context = contextWith([
    obs("Weight", "2016-09-29", 84, 95),
    obs("Weight", "2026-03-17", 100.6, 95),
    obs("Weight", "2026-09-01", 90, 95),
    obs("ALT", "2026-01-10", 30, 45),
    obs("ALT", "2026-08-20", 67, 45),
    obs("Triglycerides", "2026-02-15", 220, 150),
    obs("Triglycerides", "2026-08-20", 140, 150),
  ]);

  it("compares every lab over the window instead of one test's full history", () => {
    const result = tryRuleAnswer(
      "How has my health changed in the last 6 months. Obviously the weight has come down but how are the labs?",
      context
    );
    expect(result?.model).toBe("rules-engine");
    const rows = changeRows(result?.answer);
    expect(rows).toContain("ALT: 30 → 67 worsened");
    expect(rows).toContain("Triglycerides: 220 → 140 improved");
    expect(rows).toContain("Weight: 100.6 → 90 improved");
    expect(result?.answer).not.toContain("2016");
  });

  it("keeps a single-test trend inside the named window", () => {
    const result = tryRuleAnswer("How has my weight changed over the last 6 months?", context);
    expect(result?.answer).toContain("100.6");
    expect(result?.answer).not.toContain("2016");
    expect(result?.answer).toMatch(/fallen/);
  });
});
