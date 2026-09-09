import { describe, expect, it } from "vitest";
import { tryRuleAnswer } from "./rules";
import { fixtureContext } from "./test-fixtures";

describe("quality-first routing", () => {
  it.each([
    "What has improved and what has gotten worse in the last 6 months?",
    "How has my overall health improved in 2026?",
    "How has my ALT trended and why?",
    "What is concerning in my records?",
    "Which values are abnormal?",
    "What is my latest ALT and what does it mean?",
    "What is my current health?",
  ])("sends interpretation to reasoning: %s", (question) => {
    expect(tryRuleAnswer(question, fixtureContext())).toBeNull();
  });
  it.each(["What is my latest ALT?", "Show my latest ALT value", "Give me the most recent ALT result"])("computes exact lookups without a model: %s", (question) => {
    const result = tryRuleAnswer(question, fixtureContext());
    expect(result?.model).toBe("rules-engine");
    expect(result?.answer).toContain("60 U/L");
    expect(result?.answer).toContain("2026-09-01");
    expect(result?.answer).not.toContain("moving the wrong way");
  });
  it("does not choose arbitrarily between same-day protocol readings", () => {
    const context = fixtureContext();
    context.observations.push({ ...context.observations[3], value: 65 });
    expect(tryRuleAnswer("What is my latest ALT?", context)).toBeNull();
  });
});
