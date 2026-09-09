import { describe, expect, it } from "vitest";
import { collectEvidence } from "./evidence";
import { buildReview, validateAnalysis } from "./review";
import { fixtureContext } from "./test-fixtures";
import { encodeBlocks, parseAnswer, stripBlocks } from "./blocks";
import type { Analysis } from "./review-schema";

const evidence = collectEvidence(fixtureContext());
const lean = evidence.filter((e) => e.label === "Lean mass").map((e) => e.id);
const alt = evidence.filter((e) => e.label === "ALT").map((e) => e.id);
const base: Analysis = {
  overview: { text: "An improvement with unresolved concerns.", evidenceIds: [evidence[1].id] },
  findings: [{ title: "Gallbladder finding", text: "The newer report documents gallstones.", evidenceIds: [evidence[1].id], priority: "attention", uncertainty: null }],
  visuals: [], nextSteps: [], limitations: [],
};
describe("source-backed visual answers", () => {
  it("rejects invented citations instead of silently dropping them", () => {
    expect(() => validateAnalysis({ ...base, overview: { text: "claim", evidenceIds: ["invented"] } }, evidence)).toThrow(/not supplied/);
    expect(() => validateAnalysis({ ...base, findings: [{ ...base.findings[0], evidenceIds: [] }] }, evidence)).toThrow(/supporting/);
  });
  it("builds chart values from records and converts incompatible trends into a table", () => {
    const review = buildReview({ ...base, visuals: [{ type: "trend", title: "Lean mass", evidenceIds: lean }] }, evidence, "coverage");
    expect(review.visuals[0].type).toBe("values");
    expect(review.visuals[0].points.map((p) => p.value)).toEqual([57.2, 56]);
    expect(review.limitations.join(" ")).toContain("scanner");
  });
  it("charts comparable readings and attaches their sources", () => {
    const review = buildReview({ ...base, visuals: [{ type: "trend", title: "ALT", evidenceIds: alt }] }, evidence, "coverage");
    expect(review.visuals[0].type).toBe("trend");
    expect(review.visuals[0].points.map((p) => p.value)).toEqual([100, 60]);
    expect(review.sources.some((s) => s.documentId)).toBe(true);
  });
  it("does not manufacture a trend from a single reading", () => {
    const review = buildReview({ ...base, visuals: [{ type: "trend", title: "ALT", evidenceIds: alt.slice(1) }] }, evidence, "coverage");
    expect(review.visuals[0].type).toBe("values");
  });
  it("persists structured answers and preserves analysis for follow-ups", () => {
    const review = buildReview(base, evidence, "coverage");
    const answer = encodeBlocks(base.overview.text, [review]);
    expect(parseAnswer(answer).blocks).toEqual([review]);
    expect(stripBlocks(answer)).toContain("newer report documents gallstones");
  });
  it("discards malformed stored blocks without discarding plain text", () => {
    const answer = 'Overview\n```hearth-blocks\n[{"type":"series-chart","points":[]}]\n```';
    expect(parseAnswer(answer)).toEqual({ markdown: "Overview", blocks: [] });
  });
});
